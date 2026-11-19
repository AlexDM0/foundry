/** One call a session is about to make, as forge's tool-call guards judge it; the adapter reads it from the agent's own hook input. */
export type AgentToolCall =
  /** `null` domains: the call named domains in a shape the adapter cannot read. */
  | { readonly kind: 'shell'; readonly requestedDomains: readonly string[] | null }
  | { readonly kind: 'web-fetch'; readonly url: string | null }
  | { readonly kind: 'file-change'; readonly path: string | null; readonly workingDirectory: string | null }
  /** A call that reaches no network and runs no command. */
  | { readonly kind: 'no-reach' }
  | { readonly kind: 'unknown'; readonly toolName: string };
