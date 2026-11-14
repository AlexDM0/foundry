/**
 * The happening a chat's turns show, as a cue of the chat habitat (`bridge/conversation/ChatSpriteHabitat.ts`). It reads only the newest
 * turn that is not a system line: a decision asks a question; an agent turn failed when its last tool call failed, else it is done once it
 * stops working, and while it works it calls a tool, writes once it has prose, or thinks. A message of User's is no happening of the agent.
 */
import type { CueOccasion }     from '../flint/UseCueOnChange.ts';
import { CHAT_CUES }            from './ChatSpriteHabitat.ts';
import type { ToolCallOutcome } from './ToolUseFold.tsx';

/** The fields of an agent turn the cue reads; the thread's turns satisfy it unchanged. */
interface CuedAgentTurn {
  readonly kind:        'agent';
  readonly key:         string;
  readonly workingText: string | null;
  readonly prose:       string;
  readonly toolUse:     { readonly calls: readonly { readonly outcome: ToolCallOutcome }[] } | null;
}

export type CuedChatTurn = { readonly kind: 'system' } | { readonly kind: 'user' } | { readonly kind: 'decision'; readonly key: string } | CuedAgentTurn;

function agentTurnCueOf(turn: CuedAgentTurn): string {
  const lastCall = turn.toolUse?.calls.at(-1);
  if (lastCall?.outcome === 'error') return CHAT_CUES.AGENT_FAILED;
  if (turn.workingText === null) return CHAT_CUES.AGENT_IS_DONE;
  if (lastCall?.outcome === 'running') return CHAT_CUES.AGENT_CALLS_A_TOOL;
  return turn.prose === '' ? CHAT_CUES.AGENT_IS_THINKING : CHAT_CUES.AGENT_IS_WRITING;
}

export function chatCueOccasionOf(turns: readonly CuedChatTurn[]): CueOccasion | null {
  const newestTurn = turns.findLast((turn) => turn.kind !== 'system');
  if (newestTurn === undefined || newestTurn.kind === 'user') return null;
  const cueName = newestTurn.kind === 'decision' ? CHAT_CUES.AGENT_ASKS_A_QUESTION : agentTurnCueOf(newestTurn);
  return { cueName, occasionKey: `${newestTurn.key}:${cueName}` };
}
