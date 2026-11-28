/**
 * A clean restart of the board's Talos: the quit frame with reason `restart`. Talos then asks each agent to stop at the
 * end of its turn, records it paused and quits; Hephaestus finds the connection closed, starts the right Talos at its next pass, and the
 * paused agents resume by themselves under it.
 */
import type { TalosConnection } from './TalosConnection.ts';

/** `nothing-to-do` when no Talos took the quit: none is connected, it is quitting already, or it did not answer within the frame timeout. */
export type TalosRestartOutcome = 'done' | 'nothing-to-do';

export async function quitTalosForRestart(connection: TalosConnection | null): Promise<TalosRestartOutcome> {
  if (connection === null) return 'nothing-to-do';
  const answer = await connection.send({ kind: 'quit', reason: 'restart' });
  return answer !== 'no-answer' && answer.verdict === 'done' ? 'done' : 'nothing-to-do';
}
