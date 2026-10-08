/**
 * /api/chat — the main chat route.
 * POST /api/chat  body: { sessionId?, message, mode?: 'chat' | 'compare', compare?: CompareInput }
 *
 * Modes:
 *   - 'chat' (default): regular LLM turn. Tool calls allowed. Persists to chat_messages.
 *   - 'compare': one-shot Groq call that produces the Compare-page report. Not persisted.
 *
 * Streaming: the 'chat' mode streams via SSE. The 'compare' mode returns a
 * single JSON object (the report is short enough not to need streaming).
 *
 * Auth: required. Guests get 401 and the frontend redirects to /signin.
 */

import { NextRequest } from 'next/server';
import { getServerSupabase } from '../../../lib/supabase/route-handler';
import { SYSTEM_PROMPT, COMPARE_PROMPT, CAP_REFUSAL_PROMPT } from '../../../lib/chat/system-prompt';
import {
  getCurrentAqi, get7DayForecast, getRecentAdvisoriesForUser,
  getStationListInState, getMaharashtraCatalog, bucketFromAqi, getMethodologyText, scheduleEmail,
  type CompareInput,
  type Profile,
} from '../../../lib/chat/tools';
import { cacheGet, cachePut, cacheKeyFor, DAILY_MESSAGE_CAP } from '../../../lib/chat/ratelimit';

export const runtime = 'nodejs';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const PRIMARY_MODEL = process.env.GROQ_PRIMARY_MODEL ?? 'openai/gpt-oss-20b';
const FALLBACK_MODEL = process.env.GROQ_FALLBACK_MODEL ?? 'openai/gpt-oss-120b';
const TEMP = 0.3;
const MAX_TOKENS_CHAT = 800;
const MAX_TOKENS_COMPARE = 600;
const MAX_TOOL_CALLS = 4;

// ----- Groq tool definitions (sent on every chat turn) -----------------------

const GROQ_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_current_aqi',
      description: 'Fetch the current AQI, all 6 pollutant readings, and the dominant pollutant for a place. Always called fresh (never cached).',
      parameters: {
        type: 'object',
        properties: { place_slug: { type: 'string', description: 'Lowercase, hyphen-separated place name, e.g. "borivali", "bandra"' } },
        required: ['place_slug'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_7day_forecast',
      description: 'Fetch the 7-day AQI forecast with confidence band for a place. Always called fresh.',
      parameters: {
        type: 'object',
        properties: { place_slug: { type: 'string' } },
        required: ['place_slug'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_recent_advisories_for_user',
      description: "Fetch the user's last N advisories they've read.",
      parameters: {
        type: 'object',
        properties: { limit: { type: 'integer', minimum: 1, maximum: 20 } },
        required: ['limit'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_station_list_in_state',
      description: 'List all stations in a state with their current AQI. Useful for "which station is cleanest near me" type questions.',
      parameters: {
        type: 'object',
        properties: { state: { type: 'string' } },
        required: ['state'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_methodology_text',
      description: 'Fetch the Aira methodology text (NAQI formula, regression model, data sources).',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'schedule_email',
      description: 'Schedule a one-time future email about a place. The email body is fetched fresh at send time.',
      parameters: {
        type: 'object',
        properties: {
          when_iso: { type: 'string', description: 'ISO-8601 datetime, in the future, within 7 days' },
          topic: { type: 'string', description: 'Short description of what the email should cover' },
          place_slug: { type: 'string' },
        },
        required: ['when_iso', 'topic', 'place_slug'],
      },
    },
  },
];

// ----- Tool dispatcher (LLM tool name -> our async fn) -----------------------

async function dispatchTool(name: string, args: any, ctx: any): Promise<string> {
  try {
    switch (name) {
      case 'get_current_aqi': {
        const r = await getCurrentAqi(args.place_slug);
        return JSON.stringify(r);
      }
      case 'get_7day_forecast': {
        const r = await get7DayForecast(args.place_slug);
        return JSON.stringify(r);
      }
      case 'get_recent_advisories_for_user': {
        const r = await getRecentAdvisoriesForUser(ctx.userId, args.limit ?? 5);
        return JSON.stringify(r);
      }
      case 'get_station_list_in_state': {
        const r = await getStationListInState(args.state);
        return JSON.stringify(r);
      }
      case 'get_methodology_text': {
        const r = getMethodologyText(args.topic);
        return r;
      }
      case 'schedule_email': {
        const r = await scheduleEmail({
          userId: ctx.userId,
          whenIso: args.when_iso ?? new Date().toISOString(),
          topic: args.topic,
          placeSlug: args.place,
        });
        return JSON.stringify(r);
      }
      default:
        return JSON.stringify({ error: `unknown tool: ${name}` });
    }
  } catch (e) {
    return JSON.stringify({ error: e instanceof Error ? e.message : String(e) });
  }
}

// ----- Groq HTTP helper with retry/fallback ---------------------------------

async function callGroq(body: any): Promise<any> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY not set');
  for (const model of [PRIMARY_MODEL, FALLBACK_MODEL]) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const r = await fetch(GROQ_API_URL, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${apiKey}`, 'content-type': 'application/json' },
          body: JSON.stringify({ ...body, model, reasoning_effort: 'low' }),
        });
        if (r.ok) return await r.json();
        const text = await r.text();
        const missingModel = r.status === 404 || /model_not_found|does not exist/i.test(text);
        if (missingModel) break;
        if ((r.status === 429 || r.status >= 500) && attempt === 0) {
          await new Promise(res => setTimeout(res, 1000 * (attempt + 1)));
          continue;
        }
        if (r.status === 429 || r.status >= 500) break;
        throw new Error(`groq ${r.status}: ${text}`);
      } catch (e) {
        if (attempt === 1 && model === FALLBACK_MODEL) throw e;
      }
    }
  }
  throw new Error('all groq models failed');
}

// ----- Auth helper ------------------------------------------------------------

async function getAuthedUser() {
  const { supabase } = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  return { user, supabase };
}

function groqText(message: { content?: string | null; reasoning?: string | null } | undefined): string {
  return (message?.content || message?.reasoning || '').trim();
}

function compact(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

const PROFILE_NAME: Record<string, string> = {
  healthy: 'healthy adult',
  child: 'child',
  elderly: 'elderly',
  asthmatic: 'asthmatic',
};

function visitLine(profile: string, place: string, aqi: number, bucket: string): string {
  const who = PROFILE_NAME[profile] ?? profile;
  if ((profile === 'asthmatic' || profile === 'child' || profile === 'elderly') && aqi >= 201) {
    return `For the ${who} advisory filter, ${place} at ${aqi} (${bucket}) is too high. Tell them not to visit right now.`;
  }
  if ((profile === 'asthmatic' || profile === 'child' || profile === 'elderly') && aqi >= 101) {
    return `For the ${who} advisory filter, ${place} is ${aqi} (${bucket}). Tell them to keep the visit short and avoid outdoor exertion.`;
  }
  if (profile === 'healthy' && aqi >= 301) {
    return `For the healthy-adult advisory filter, ${place} at ${aqi} (${bucket}) is too high. Tell them to avoid the visit.`;
  }
  if (profile === 'healthy' && aqi >= 201) {
    return `For the healthy-adult advisory filter, ${place} is ${aqi} (${bucket}). Tell them to limit time outdoors.`;
  }
  return `For the ${who} advisory filter, ${place} is ${aqi} (${bucket}). Tell them it is reasonable to go.`;
}

function safeVisible(raw: string): string {
  const cut = raw.lastIndexOf('[[');
  if (cut === -1) return raw;
  if (!raw.slice(cut).includes(']]')) return raw.slice(0, cut);
  return raw.replace(/\[\[memory:\s*[^\]]*\]\]/gi, '');
}

function takeMemory(raw: string): { visible: string; facts: string[] } {
  const facts: string[] = [];
  const visible = raw.replace(/\[\[memory:\s*([^\]]+)\]\]/gi, (_all, fact) => {
    const cleaned = String(fact).trim();
    if (cleaned) facts.push(cleaned);
    return '';
  }).trim();
  return { visible, facts };
}

async function rememberFacts(supabase: any, existing: string, facts: string[]): Promise<void> {
  const lines = [...existing.split('\n').map((s) => s.trim()).filter(Boolean), ...facts];
  const unique: string[] = [];
  for (const line of lines) {
    if (!unique.some((u) => u.toLowerCase() === line.toLowerCase())) unique.push(line);
  }
  const memory = unique.slice(-8).join('\n').slice(0, 500);
  await supabase.auth.updateUser({ data: { aira_memory: memory } });
}

function needsLiveTools(message: string): boolean {
  return /\b(e-?mail|remind|schedule|methodology|formula|cleanest|stations|compare|every city|all cities)\b/i.test(message);
}

async function openGroqStream(payload: Record<string, unknown>): Promise<{ upstream: globalThis.Response; model: string }> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY not set');
  let last = 'all groq models failed';
  for (const model of [PRIMARY_MODEL, FALLBACK_MODEL]) {
    const r = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ ...payload, model, stream: true, reasoning_effort: 'low' }),
    });
    if (r.ok && r.body) return { upstream: r, model };
    last = (await r.text()).slice(0, 200);
    if (!(r.status === 404 || r.status === 429 || r.status >= 500 || /model_not_found|does not exist/i.test(last))) {
      break;
    }
  }
  throw new Error(last);
}

// ----- Handler: regular chat (streaming SSE) ---------------------------------

async function handleChat(body: { sessionId: string; message: string }): Promise<Response> {
  const auth = await getAuthedUser();
  if (!auth) return new Response('unauthorized', { status: 401 });

  const { user, supabase } = auth;

  const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
  const [capResult, sessionResult, userResult, historyResult, catalogResult] = await Promise.all([
    supabase
      .from('chat_messages')
      .select('*', { count: 'exact', head: true })
      .eq('session_id', body.sessionId)
      .gte('created_at', startOfDay.toISOString()),
    supabase
      .from('chat_sessions')
      .select('state, city, place, profile_type')
      .eq('id', body.sessionId)
      .single(),
    supabase.from('users').select('email, display_name, bio, health_profile, default_state, default_city, default_place').eq('id', user.id).single(),
    supabase.from('chat_messages').select('role, content').eq('session_id', body.sessionId).order('created_at', { ascending: false }).limit(8),
    getMaharashtraCatalog(),
  ]);
  if ((capResult.count ?? 0) >= DAILY_MESSAGE_CAP) {
    return new Response('daily_cap', { status: 429 });
  }
  const session = sessionResult.data;
  if (!session) return new Response('session_not_found', { status: 404 });
  const userRow = userResult.data;
  const history = (historyResult.data ?? []).slice().reverse().filter((m) => m.role === 'user' || m.role === 'assistant');
  const catalog = catalogResult;

  // 4. Cache key includes the thread and the readings, so a follow-up is not served an old reply.
  const cacheKey = await cacheKeyFor(body.message, {
    session,
    history: history.map((m) => m.content).join('\n'),
    catalog: catalog.map((s) => `${s.id}:${s.aqi}`).join(','),
    name: userRow?.display_name ?? '',
    bio: userRow?.bio ?? '',
  });
  const cached = cacheGet(cacheKey);
  if (cached) {
    // Persist + return cached
    await persistMessages(supabase, body.sessionId, body.message, cached.text, cached.model);
    return new Response(cached.text, { headers: { 'content-type': 'text/plain', 'x-cached': '1' } });
  }

  // 5. Build system prompt with the account, this chat's filter, and every station.
  const placeSlug = compact(String(session.place));
  const here = catalog.find((s) => compact(s.place) === placeSlug);
  let aqi = here?.aqi ?? 0;
  let bucket = aqi ? bucketFromAqi(aqi) : 'Moderate';
  let dominant = here?.dominant ?? 'pm25';
  const forecast: { date: string; aqi: number; lo: number; hi: number }[] = [];
  if (!aqi) {
    try {
      const live = await getCurrentAqi(placeSlug);
      aqi = live.aqi;
      bucket = live.bucket;
      dominant = live.dominant;
    } catch { /* catalog is the source when the worker has no row */ }
  }

  const profile = (['healthy', 'child', 'elderly', 'asthmatic'].includes(session.profile_type) ? session.profile_type : 'healthy') as Profile;
  const ctx = {
    userId: user.id,
    userEmail: userRow?.email ?? '',
    placeName: `${session.place}, ${session.city}`,
    placeSlug,
    placeState: session.state,
    placeCity: session.city,
    profile,
    aqi, bucket: bucket as any, dominant: dominant as any, forecast, recentAdvisories: [],
    emailQuotaRemaining: 2,
  };
  const text = compact(body.message);
  const asked = catalog.filter((s) => {
    const place = compact(s.place);
    const city = compact(s.city);
    const namesPlace = place.length > 3 && text.includes(place);
    const namesCity = city.length > 3 && text.includes(city);
    return (namesPlace || namesCity) && !(place === placeSlug && !namesCity);
  });
  const stationLines = catalog
    .filter((s) => s.aqi > 0)
    .map((s) => `${s.place}, ${s.city}: AQI ${s.aqi} (${bucketFromAqi(s.aqi)}), dominant ${s.dominant}`)
    .join('\n');
  const accountName = userRow?.display_name?.trim() || String(userRow?.email || user.email || '').split('@')[0] || 'not set';
  const accountBio = userRow?.bio?.trim() || 'none';
  const accountProfile = PROFILE_NAME[userRow?.health_profile] ?? userRow?.health_profile ?? 'not set';
  const home = [userRow?.default_place, userRow?.default_city].filter(Boolean).join(', ') || 'not set';
  const remembered = String(user.user_metadata?.aira_memory ?? '').trim() || 'none';
  let askedAbout = '';
  if (asked.length) {
    const worst = asked.reduce((a, b) => (a.aqi >= b.aqi ? a : b));
    const lines = asked.map((s) => `${s.place}, ${s.city}: AQI ${s.aqi} (${bucketFromAqi(s.aqi)})`).join('; ');
    const where = asked.every((s) => compact(s.city) === compact(asked[0].city)) ? asked[0].city : worst.place;
    askedAbout = `\nThey asked about ${where}. Readings: ${lines}. ${visitLine(profile, `${worst.place}, ${worst.city}`, worst.aqi, bucketFromAqi(worst.aqi))} If they also asked who they are, say their name is ${accountName}.`;
  }
  const directPrompt = `You are Aira, the air quality assistant. Reply in short plain sentences. No markdown, no emojis.
Their name, saved on the account, is ${accountName}. If they edited it in settings, this is the new name. Bio: ${accountBio}. Home area: ${home}. Account health profile: ${accountProfile}.
When they ask their name, who they are, or "but who am I", answer with the name ${accountName}. Do not answer a name question with the advisory filter. Earlier replies that called them only "${PROFILE_NAME[profile] ?? profile}" were wrong about their name.
The advisory filter for this chat is separate. It is ${PROFILE_NAME[profile] ?? profile}, for ${ctx.placeName}. Use the filter only when they ask which filter they chose.
Current reading at ${ctx.placeName}: AQI ${ctx.aqi} (${ctx.bucket}), dominant ${ctx.dominant}. ${visitLine(profile, ctx.placeName, ctx.aqi, ctx.bucket)}
Stations you can cite. Never say you have no data for a place that appears here:
${stationLines || 'none loaded'}
Use only these numbers. Cite them as [source: stored readings, today].${askedAbout}
Details they asked you to remember: ${remembered}.
If they tell you a lasting personal detail, add one line at the very end in this exact form: [[memory: short fact]]. Do not invent details.`;
  const systemPrompt = needsLiveTools(body.message) ? SYSTEM_PROMPT(ctx) : directPrompt;

  const userSaved = persistUserMessage(supabase, body.sessionId, body.message);

  const prior: { role: string; content: string }[] = [];
  for (let i = 0; i < history.length; i++) {
    const current = history[i];
    const next = history[i + 1];
    const sameQuestion = current.role === 'user' && String(current.content).trim() === body.message.trim();
    if (sameQuestion && next?.role === 'assistant') {
      i += 1;
      continue;
    }
    prior.push({ role: current.role, content: String(current.content).slice(0, 500) });
  }
  const messages: any[] = [
    { role: 'system', content: systemPrompt },
    ...prior,
    { role: 'user', content: `${body.message}\n\nUse the saved account name "${accountName}" if this asks who they are or what their name is. Do not repeat an older reply that left that name out.` },
  ];

  if (!needsLiveTools(body.message)) {
    const encoder = new TextEncoder();
    const upstreamPromise = openGroqStream({
      messages,
      temperature: TEMP,
      max_tokens: 320,
    });
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const { upstream, model } = await upstreamPromise;
          const reader = upstream.body!.getReader();
          const decoder = new TextDecoder();
          let buf = '';
          let content = '';
          let reasoning = '';
          let sent = 0;
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            const lines = buf.split('\n');
            buf = lines.pop() ?? '';
            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith('data:')) continue;
              const payload = trimmed.slice(5).trim();
              if (!payload || payload === '[DONE]') continue;
              let data: any;
              try { data = JSON.parse(payload); } catch { continue; }
              const delta = data.choices?.[0]?.delta ?? {};
              if (delta.content) content += delta.content;
              else if (typeof delta.reasoning === 'string') reasoning += delta.reasoning;
              const safe = safeVisible(content);
              if (safe.length > sent) {
                controller.enqueue(encoder.encode(safe.slice(sent)));
                sent = safe.length;
              }
            }
          }
          let text = content.trim() || reasoning.trim();
          if (!text) {
            text = `In ${ctx.placeName} the stored AQI is ${ctx.aqi} (${ctx.bucket}). The dominant pollutant is ${ctx.dominant}.`;
          }
          const kept = takeMemory(text);
          text = kept.visible || text;
          if (text.length > sent) controller.enqueue(encoder.encode(text.slice(sent)));
          if (kept.facts.length) {
            await rememberFacts(supabase, String(user.user_metadata?.aira_memory ?? ''), kept.facts);
          }
          await userSaved;
          await persistAssistantMessage(supabase, body.sessionId, text, model, messages);
          cachePut(cacheKey, text, model);
          controller.close();
        } catch (e) {
          controller.error(e);
        }
      },
    });
    return new Response(stream, {
      headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-cache, no-transform' },
    });
  }

  await userSaved;
  let model = PRIMARY_MODEL;
  let toolCallCount = 0;
  let finalText = '';
  while (true) {
    const groqBody: any = {
      messages,
      tools: GROQ_TOOLS,
      tool_choice: 'auto',
      temperature: TEMP,
      max_tokens: MAX_TOKENS_CHAT,
    };
    const resp = await callGroq(groqBody);
    model = resp.model;
    const choice = resp.choices?.[0];
    if (!choice) throw new Error('groq returned no choices');
    const msg = choice.message;

    if (msg.tool_calls && msg.tool_calls.length > 0) {
      // Cap tool calls per turn
      if (toolCallCount + msg.tool_calls.length > MAX_TOOL_CALLS) {
        // Cut the loop; force a final answer with what we have
        messages.push({
          role: 'user',
          content: `You've called ${toolCallCount} tools already; you have ${MAX_TOOL_CALLS - toolCallCount} more. Synthesize an answer with what you have.`,
        });
        toolCallCount = MAX_TOOL_CALLS;
        continue;
      }
      messages.push(msg);
      for (const tc of msg.tool_calls) {
        const args = JSON.parse(tc.function.arguments);
        const result = await dispatchTool(tc.function.name, args, ctx);
        messages.push({ role: 'tool', tool_call_id: tc.id, content: result });
      }
      toolCallCount += msg.tool_calls.length;
      continue;
    }
    finalText = groqText(msg);
    break;
  }

  if (!finalText) {
    finalText = `In ${ctx.placeName} the stored AQI is ${ctx.aqi} (${ctx.bucket}). The dominant pollutant is ${ctx.dominant}.`;
  }

  // 8. Persist assistant message + tool calls
  await persistAssistantMessage(supabase, body.sessionId, finalText, model, messages);

  // 9. Cache + return
  cachePut(cacheKey, finalText, model);
  return new Response(finalText, { headers: { 'content-type': 'text/plain' } });
}

// ----- Handler: compare (one-shot, not persisted) ----------------------------

async function handleCompare(req: NextRequest, body: any): Promise<Response> {
  const auth = await getAuthedUser();
  if (!auth) return new Response('unauthorized', { status: 401 });

  const compare: CompareInput = body.compare;
  if (!compare?.placeA || !compare?.placeB) {
    return new Response('bad_request', { status: 400 });
  }
  const profile: Profile = compare.profile ?? 'healthy';

  // Resolve full readings + forecasts for both places via /api/compare
  // (which calls Supabase + Groq with the cross-state guard).
  const r = await fetch(new URL('/api/compare', req.url), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ placeA: compare.placeA, placeB: compare.placeB, profile }),
  });
  if (!r.ok) {
    return new Response(`compare upstream failed: HTTP ${r.status}`, { status: r.status });
  }
  const json = await r.json();

  // Build the compare-specific system prompt
  const profileLines: Record<string, string> = {
    healthy: 'Air quality is acceptable for most people. Sensitive groups should still consider reducing prolonged outdoor exertion on bad days.',
    child: "Children's lungs are still developing. Outdoor play should be shorter on Moderate or worse days.",
    elderly: 'Heart and lung conditions worsen faster at Poor+. Walk slowly, rest often, and avoid strenuous outdoor activity.',
    asthmatic: 'Outdoor air will likely trigger symptoms at Poor+. Keep rescue inhaler accessible, stay indoors, windows closed.',
  };
  const enrichedCompare = {
    ...compare,
    profileLine: profileLines[profile] ?? '',
    profile,
    placeA: json.a,
    placeB: json.b,
  };
  const systemPrompt = COMPARE_PROMPT(enrichedCompare as any);
  const userMsg = `Compare ${json.a.station.name} and ${json.b.station.name} for the ${profile} profile.`;

  // Single Groq call (no tools, no streaming for compare — short output)
  const resp = await callGroq({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMsg },
    ],
    temperature: TEMP,
    max_tokens: MAX_TOKENS_COMPARE,
  });
  const text = groqText(resp.choices?.[0]?.message);
  return Response.json({ text, model: resp.model });
}

// ----- Persistence helpers ---------------------------------------------------

async function touchSession(supabase: any, sessionId: string): Promise<void> {
  await supabase.from('chat_sessions').update({ last_message_at: new Date().toISOString() }).eq('id', sessionId);
}

async function persistUserMessage(supabase: any, sessionId: string, content: string): Promise<void> {
  await supabase.from('chat_messages').insert({
    session_id: sessionId,
    role: 'user',
    content,
  });
  await touchSession(supabase, sessionId);
}

async function persistMessages(
  supabase: any, sessionId: string, userText: string, assistantText: string, model: string,
): Promise<void> {
  await supabase.from('chat_messages').insert([
    { session_id: sessionId, role: 'user', content: userText },
    { session_id: sessionId, role: 'assistant', content: assistantText, model },
  ]);
}

async function persistAssistantMessage(
  supabase: any, sessionId: string, content: string, model: string, allMessages: any[],
): Promise<void> {
  // Extract the tool calls from the messages (skip system + final assistant)
  const toolCalls: any[] = [];
  for (const m of allMessages) {
    if (m.role === 'assistant' && m.tool_calls) {
      for (const tc of m.tool_calls) {
        // Find the corresponding tool result
        const result = allMessages.find(
          (x: any) => x.role === 'tool' && x.tool_call_id === tc.id,
        );
        toolCalls.push({
          tool: tc.function.name,
          args: JSON.parse(tc.function.arguments),
          result: result ? JSON.parse(result.content) : null,
        });
      }
    }
  }
  await supabase.from('chat_messages').insert({
    session_id: sessionId,
    role: 'assistant',
    content,
    model,
    tool_calls: toolCalls.length > 0 ? toolCalls : null,
  });
  await touchSession(supabase, sessionId);
}

// ----- Main entry point ------------------------------------------------------

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const body = await req.json() as any;
    if (body.mode === 'compare') {
      return await handleCompare(req, body);
    }
    return await handleChat(body);
  } catch (e) {
    return new Response(`error: ${e instanceof Error ? e.message : 'unknown'}`, { status: 500 });
  }
}
