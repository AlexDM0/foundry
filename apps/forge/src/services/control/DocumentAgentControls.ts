/** The moves on a ticket document's agent: User's effect reading of a version and User's stop of the agent's running turn. */

function agentMoveNotBuilt(): never {
  throw new Error('lane C');
}

export const DOCUMENT_AGENT_CONTROLS = {
  'ticket-document-effect-read': agentMoveNotBuilt,
  'ticket-document-turn-stop':   agentMoveNotBuilt,
} as const;
