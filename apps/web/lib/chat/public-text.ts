const TOOL_LABELS: Record<string, string> = {
  get_current_aqi: 'stored readings',
  get_7day_forecast: '7-day forecast',
  get_station_list_in_state: 'stored readings',
  get_recent_advisories_for_user: 'your advisories',
  get_methodology_text: 'methodology',
  schedule_email: 'email schedule',
};

function labelFor(tool: string): string {
  const name = tool.toLowerCase().replace(/\([^)]*\)/g, '').trim();
  return TOOL_LABELS[name] ?? 'stored readings';
}

/** Hide programming function names before a chat reply is shown or saved. */
export function publicChatText(raw: string): string {
  let text = raw.replace(/\*\*/g, '');
  text = text.replace(/^[ \t]*Sources used:.*$/gim, '');
  text = text.replace(/\[source:\s*(get_[a-z0-9_]+|schedule_email)(?:\([^)]*\))?\s*(?:,\s*([^\]]+))?\]/gi, (_all, tool, time) => {
    const when = String(time ?? 'today').trim() || 'today';
    return `[source: ${labelFor(tool)}, ${when}]`;
  });
  text = text.replace(/\b(?:get_current_aqi|get_7day_forecast|get_station_list_in_state|get_recent_advisories_for_user|get_methodology_text|schedule_email)\b(?:\([^)]*\))?/gi, '');
  return text.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}
