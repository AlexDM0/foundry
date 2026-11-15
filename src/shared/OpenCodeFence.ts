/** Which code fence a Markdown line leaves open, as CommonMark reads it: shared by the release's reading of a ticket body and the renderer. */
import { TICKET_SECTION_PATTERNS } from './constants/TicketSectionPatterns.ts';

export interface OpenCodeFence {
  character: string;
  length:    number;
}

/**
 * Only a fence of the opening character, at least as long and with nothing after it, closes one; every other fence line inside is text.
 * A backtick fence whose info string holds a backtick opens nothing.
 */
export function openCodeFenceAfter(line: string, openFence: OpenCodeFence | null): OpenCodeFence | null {
  const fenceLine = TICKET_SECTION_PATTERNS.CODE_FENCE.exec(line);
  if (fenceLine === null) return openFence;
  const run       = fenceLine[1] ?? '';
  const afterRun  = fenceLine[2] ?? '';
  const character = run.charAt(0);
  if (openFence === null) return character === '`' && afterRun.includes('`') ? null : { character, length: run.length };
  const closesTheFence = character === openFence.character && run.length >= openFence.length && afterRun.trim() === '';
  return closesTheFence ? null : openFence;
}
