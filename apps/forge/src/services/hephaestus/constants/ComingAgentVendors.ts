/**
 * The agent vendors forge names to a view before it can run them, each shown as coming later and never chosen: no adapter, program,
 * install place or flag of theirs exists in forge until their adapter does. A vendor with an adapter leaves this list for it.
 */
export const COMING_AGENT_VENDORS = Object.freeze([
  { vendor: 'codex', displayName: 'Codex' },
  { vendor: 'github-copilot', displayName: 'GitHub Copilot' },
] as const);
