/**
 * Chat page — the Aira chat UI. Two-pane: left sidebar with chat sessions
 * (grouped Today / Yesterday / This week / Older), right pane with the
 * current session's messages.
 *
 * POST /api/chat streams via SSE. The client reads the stream and renders
 * tokens as they arrive. Citations are rendered as styled chips.
 *
 * The sidebar's "New chat" button creates a new session via POST
 * /api/chat-sessions and navigates to it. Clicking a session navigates
 * to its URL. The active session is highlighted.
 *
 * The page is parameterised by /[state]/[city]/[place]. For Borivali the
 * route is /maharashtra/mumbai/borivali/advisory/chat; for other stations
 * the route is /<state>/<city>/<place>/advisory/chat. The chat itself is
 * Borivali-only at the API level (sessions are tied to stations), so for
 * non-Borivali routes we still produce working chat links but the user
 * experiences Borivali chat.
 */

'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useSearchParams, useParams } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import styles from './page.module.css';
import { unslug } from '../../../../../../lib/area';
import { publicChatText } from '../../../../../../lib/chat/public-text';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  tool_calls?: any[];
  created_at: string;
}

interface Session {
  id: string;
  title: string | null;
  state: string;
  city: string;
  place: string;
  profile: string;
  created_at: string;
  last_message_at: string | null;
}

interface GroupedSessions {
  [bucket: string]: Session[];
}

function groupByRecency(sessions: Session[]): GroupedSessions {
  const groups: GroupedSessions = { Today: [], Yesterday: [], 'This week': [], Older: [] };
  for (const s of sessions) {
    const t = s.last_message_at ? new Date(s.last_message_at) : new Date(s.created_at);
    const hoursAgo = (Date.now() - t.getTime()) / 36e5;
    if (hoursAgo < 24) groups.Today.push(s);
    else if (hoursAgo < 48) groups.Yesterday.push(s);
    else if (hoursAgo < 168) groups['This week'].push(s);
    else groups.Older.push(s);
  }
  return groups;
}

// Parse the [source: tool_name, time] citation chips in the assistant's reply
function renderWithCitations(text: string) {
  text = publicChatText(text);
  const parts: (string | { kind: 'citation'; tool: string; time: string })[] = [];
  const re = /\[source:\s*([^,]+),\s*([^\]]+)\]/g;
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIndex) parts.push(text.slice(lastIndex, m.index));
    parts.push({ kind: 'citation', tool: m[1].trim(), time: m[2].trim() });
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts.map((p, i) => {
    if (typeof p === 'string') return <span key={i}>{p}</span>;
    return (
      <span key={i} className={styles.citeChip}>
        [source: {p.tool}, {p.time}]
      </span>
    );
  });
}

function asSession(raw: any): Session {
  return {
    ...raw,
    profile: raw.profile ?? raw.profile_type ?? 'healthy',
  };
}

export default function ChatPage() {
  const search = useSearchParams();
  const routeParams = useParams<{ state: string; city: string; place: string }>();
  const baseHref = routeParams
    ? `/${routeParams.state}/${routeParams.city}/${routeParams.place}`
    : '/maharashtra/mumbai/borivali';
  const placeName = routeParams?.place
    ? routeParams.place.charAt(0).toUpperCase() + routeParams.place.slice(1)
    : 'Borivali';
  const [sessionId, setSessionId] = useState<string | null>(search.get('session'));
  const [sessions, setSessions] = useState<Session[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(Boolean(search.get('session')));
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [accountName, setAccountName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const messagesEnd = useRef<HTMLDivElement>(null);
  const sendingRef = useRef(false);
  const creatingRef = useRef(false);
  const viewRef = useRef(0);
  const sessionIdRef = useRef(sessionId);
  const queuedRef = useRef<string | null>(null);

  const loadSessions = useCallback(async () => {
    try {
      const r = await fetch('/api/chat-sessions');
      if (r.ok) {
        const { sessions: list } = await r.json();
        const incoming: Session[] = (list ?? []).map(asSession);
        setSessions((current) => {
          const pending = current.filter((s) => s.id.startsWith('pending-'));
          const known = new Set(incoming.map((s) => s.id));
          return [...pending.filter((s) => !known.has(s.id)), ...incoming];
        });
      }
    } catch {}
  }, []);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user || cancelled) return;
      const { data } = await supabase.from('users').select('display_name, avatar_url').eq('id', user.id).single();
      if (cancelled || !data) return;
      setAccountName(data.display_name ?? '');
      setAvatarUrl(data.avatar_url ?? null);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    sessionIdRef.current = sessionId;
    if (!sessionId || sessionId.startsWith('pending-')) {
      if (!sessionId) setMessages([]);
      return;
    }
    const view = viewRef.current;
    let cancelled = false;
    setHistoryLoading(true);
    (async () => {
      try {
        const r = await fetch(`/api/chat-sessions/${sessionId}/messages`);
        if (!r.ok || cancelled || view !== viewRef.current || sendingRef.current) return;
        const { messages: list } = await r.json();
        if (!cancelled && view === viewRef.current && !sendingRef.current) setMessages(list ?? []);
      } finally {
        if (!cancelled && view === viewRef.current) setHistoryLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [sessionId]);

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function saveTitle() {
    const title = titleDraft.trim();
    const id = sessionIdRef.current;
    setEditingTitle(false);
    if (!id || id.startsWith('pending-') || !title) return;
    setSessions((list) => list.map((s) => (s.id === id ? { ...s, title } : s)));
    const r = await fetch(`/api/chat-sessions/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    if (!r.ok) {
      setError('Could not rename that chat');
      loadSessions();
    }
  }

  async function shareLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setError('Could not copy the link');
    }
  }

  function rememberSession(id: string) {
    const path = `${baseHref}/advisory/chat?session=${id}`;
    window.history.replaceState(null, '', path);
    sessionIdRef.current = id;
    setSessionId(id);
  }

  async function newChat() {
    if (creatingRef.current) return;
    creatingRef.current = true;
    setCreating(true);
    viewRef.current += 1;
    const tempId = `pending-${Date.now()}`;
    const optimistic: Session = {
      id: tempId,
      title: 'New chat',
      state: routeParams?.state ?? 'maharashtra',
      city: routeParams?.city ?? 'mumbai',
      place: placeName,
      profile: 'healthy',
      created_at: new Date().toISOString(),
      last_message_at: null,
    };
    setSessions((list) => [optimistic, ...list.filter((s) => s.id !== tempId)]);
    setMessages([]);
    setInput('');
    setError('');
    sessionIdRef.current = tempId;
    setSessionId(tempId);
    try {
      const r = await fetch('/api/chat-sessions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          state: unslug(routeParams?.state ?? 'maharashtra'),
          city: unslug(routeParams?.city ?? 'mumbai'),
          place: unslug(routeParams?.place ?? 'borivali'),
        }),
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok || !json.session) throw new Error(json.error ?? 'Could not start a chat');
      const session = asSession(json.session);
      setSessions((list) => [session, ...list.filter((s) => s.id !== tempId && s.id !== session.id)]);
      if (sessionIdRef.current === tempId) rememberSession(session.id);
    } catch (e) {
      setSessions((list) => list.filter((s) => s.id !== tempId));
      if (sessionIdRef.current === tempId) {
        sessionIdRef.current = null;
        setSessionId(null);
      }
      setError(e instanceof Error ? e.message : 'Could not start a chat');
    } finally {
      creatingRef.current = false;
      setCreating(false);
      const next = queuedRef.current;
      queuedRef.current = null;
      if (next && sessionIdRef.current && !sessionIdRef.current.startsWith('pending-')) {
        void send(next);
      }
    }
  }

  async function send(text?: string) {
    const message = (text ?? input).trim();
    if (!message || sendingRef.current) return;
    const active = sessionIdRef.current;
    if (!active || active.startsWith('pending-') || creatingRef.current) {
      queuedRef.current = message;
      setInput('');
      if (!active && !creatingRef.current) void newChat();
      return;
    }
    if (text === undefined) setInput('');
    sendingRef.current = true;
    setSending(true);
    setError('');
    const view = viewRef.current;
    const userMsg: Message = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: message,
      created_at: new Date().toISOString(),
    };
    const assistantId = `temp-a-${Date.now()}`;
    setMessages((m) => [
      ...m,
      userMsg,
      { id: assistantId, role: 'assistant', content: '', created_at: new Date().toISOString() },
    ]);
    try {
      const r = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId: active, message }),
      });
      if (view !== viewRef.current) return;
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        throw new Error(data.error ?? `http ${r.status}`);
      }
      const reader = r.body?.getReader();
      if (!reader) throw new Error('no response body');
      const decoder = new TextDecoder();
      let acc = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done || view !== viewRef.current) break;
        acc += decoder.decode(value, { stream: true });
        const shown = acc;
        setMessages((m) => m.map((x) => (x.id === assistantId ? { ...x, content: shown } : x)));
      }
    } catch (e) {
      if (view === viewRef.current) setError(e instanceof Error ? e.message : 'send failed');
    } finally {
      sendingRef.current = false;
      setSending(false);
      loadSessions();
    }
  }

  async function deleteSession(id: string) {
    if (id.startsWith('pending-')) {
      setSessions((list) => list.filter((s) => s.id !== id));
      return;
    }
    if (!window.confirm('Delete this chat? It will be removed from your account.')) return;
    setSessions((list) => list.filter((s) => s.id !== id));
    if (sessionIdRef.current === id) {
      viewRef.current += 1;
      sessionIdRef.current = null;
      setSessionId(null);
      setMessages([]);
      setInput('');
      window.history.replaceState(null, '', `${baseHref}/advisory/chat`);
    }
    const r = await fetch(`/api/chat-sessions/${id}`, { method: 'DELETE' });
    if (!r.ok) {
      setError('Could not delete that chat');
      loadSessions();
    }
  }

  const grouped = groupByRecency(sessions);
  const activeSession = sessions.find((s) => s.id === sessionId);

  return (
    <>
            <div className={styles.layout}>
        <aside className={styles.sidebar}>
          <button className={styles.newChatBtn} onClick={newChat} disabled={creating}>+ New chat</button>
          {(['Today', 'Yesterday', 'This week', 'Older'] as const).map((bucket) =>
            grouped[bucket]?.length ? (
              <div key={bucket} className={styles.group}>
                <div className={styles.groupHeader}>{bucket.toUpperCase()}</div>
                {grouped[bucket].map((s) => (
                  <div key={s.id} className={`${styles.sessionRow} ${sessionId === s.id ? styles.active : ''}`}>
                    <button
                      type="button"
                      onClick={() => {
                      if (s.id.startsWith('pending-') || s.id === sessionId) return;
                      sendingRef.current = false;
                      viewRef.current += 1;
                      setMessages([]);
                      setInput('');
                      setEditingTitle(false);
                      rememberSession(s.id);
                      }}
                      className={styles.sessionItem}
                    >
                      <div className={styles.sessionTitle}>{s.title ?? `${s.place} · ${s.profile}`}</div>
                      <div className={styles.sessionMeta}>
                        {s.place} · {s.profile} · {s.last_message_at ? `${Math.round((Date.now() - new Date(s.last_message_at).getTime()) / 36e5)}h ago` : 'new'}
                      </div>
                    </button>
                    <button
                      type="button"
                      className={styles.deleteBtn}
                      aria-label={`Delete ${s.title ?? 'chat'}`}
                      onClick={() => deleteSession(s.id)}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            ) : null
          )}
        </aside>

        <main className={styles.main}>
          <div className={styles.sessionBar}>
            <div className={styles.sessionBarLeft}>
              <div className={styles.sessionBarIcon}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              </div>
              <div>
                {editingTitle ? (
                  <input
                    className={styles.titleInput}
                    value={titleDraft}
                    autoFocus
                    maxLength={80}
                    onChange={(e) => setTitleDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); void saveTitle(); }
                      if (e.key === 'Escape') setEditingTitle(false);
                    }}
                    onBlur={() => void saveTitle()}
                  />
                ) : (
                  <div className={styles.sessionBarTitle}>
                    {activeSession?.title ?? (activeSession ? `Chat · ${activeSession.place}` : 'Ask Aira')}
                  </div>
                )}
                <div className={styles.sessionChips}>
                  <span className={styles.chip}>{activeSession?.place ?? placeName}</span>
                  <span className={`${styles.chip} ${styles.chipAccent}`}>{activeSession?.profile ?? 'profile'}</span>
                  {activeSession && (
                    <span className={styles.sessionWhen}>
                      Started {new Date(activeSession.created_at).toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit' })} IST
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className={styles.sessionActions}>
            {activeSession && !activeSession.id.startsWith('pending-') && (
              <button
                type="button"
                className={styles.shareBtn}
                onClick={() => {
                  setTitleDraft(activeSession.title ?? `Chat · ${activeSession.place}`);
                  setEditingTitle(true);
                }}
              >
                Rename
              </button>
            )}
            <button type="button" className={styles.shareBtn} onClick={shareLink} title="Copy link">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
              {copied ? 'Copied' : 'Share'}
            </button>
            </div>
          </div>

          <div className={styles.messages}>
            {historyLoading && messages.length === 0 && (
              <div className={styles.fetching}>Fetching this chat…</div>
            )}
            {messages.length === 0 && !historyLoading && (
              <div className={styles.emptyState}>
                <div className={styles.emptyTitle}>Ask Aira about the air around you</div>
                <div className={styles.emptySub}>Try one of these, or type your own question.</div>
                <div className={styles.suggestions}>
                  {['Is it safe to take my son to Bandra today?', `When will ${placeName} be cleanest this week?`].map((q) => (
                    <button key={q} type="button" className={styles.suggestion} onClick={() => setInput(q)}>{q}</button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m) => (
              <div key={m.id} className={m.role === 'user' ? styles.userMsg : styles.assistantMsg}>
                {m.role === 'user' ? (
                  avatarUrl ? (
                    <img src={avatarUrl} alt="" className={styles.userAvatar} />
                  ) : (
                    <div className={styles.msgAvatar}>{(accountName || 'H').charAt(0).toUpperCase()}</div>
                  )
                ) : (
                  <img src="/aira-icon.png" alt="" className={styles.airaAvatar} />
                )}
                <div className={styles.msgBody}>
                  {m.content ? renderWithCitations(m.content) : (
                    <div className={styles.fetching}>Fetching the latest readings…</div>
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEnd} />
          </div>

          {error && <div className={styles.error}>{error}</div>}

          <div className={styles.inputBar}>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.repeat && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder={`Ask about the air in ${placeName}…`}
              className={styles.input}
              disabled={sending}
            />
            <button onClick={() => send()} disabled={!input.trim() || sending} className={styles.sendBtn}>
              {sending ? '…' : '→'}
            </button>
          </div>
        </main>
      </div>
    </>
  );
}
