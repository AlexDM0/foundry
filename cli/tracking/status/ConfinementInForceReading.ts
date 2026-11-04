/**
 * Whose confinement word `status --json` prints: the live Overseer's, read with its token, since this process may sit in a sandbox that
 * fails its own probe; this process's own probe only when no Overseer answers with a word.
 */
import type { ConfinementVerdict, GateConfinement } from '../../../src/lib/gate-confinement/GateConfinement.ts';
import { Baton }                                    from '../../../src/services/overseer/Baton.ts';
import { overseerFilesIn }                          from '../../../src/services/overseer/OverseerFiles.ts';
import type { Workspace }                           from '../../../src/services/tracker/Workspace.ts';
import type { CommandContext }                      from '../../CommandContext.ts';
import type { ConfinementInForce }                  from '../../StatusDocuments.ts';
import { OverseerRemote }                           from '../../overseer/OverseerRemote.ts';

const CONFINEMENT_VERDICTS: Readonly<Record<ConfinementVerdict, true>> = { confined: true, unavailable: true, 'unconfined-by-design': true };

function isConfinementVerdict(word: unknown): word is ConfinementVerdict {
  return typeof word === 'string' && Object.hasOwn(CONFINEMENT_VERDICTS, word);
}

/** `overseerState` is the live Overseer's `/api/state` document, or `null` when none answered. */
export function confinementInForceOf(overseerState: unknown, ownProbe: GateConfinement): ConfinementInForce {
  const overseerWord = typeof overseerState === 'object' && overseerState !== null ? (overseerState as { confinement?: unknown }).confinement : null;
  return isConfinementVerdict(overseerWord)
    ? { confinement: overseerWord, confinementSource: 'overseer' }
    : { confinement: ownProbe.availability().verdict, confinementSource: 'this-process' };
}

export async function readConfinementInForce(context: Pick<CommandContext, 'platformPorts'>, workspace: Workspace): Promise<ConfinementInForce> {
  const newest        = Baton.newestBatonOf(context.platformPorts, overseerFilesIn(workspace.trackerDirectory).overseerDirectory);
  const overseerState = newest.verdict === 'live' ? await OverseerRemote.stateOf(newest.record) : null;
  return confinementInForceOf(overseerState, context.platformPorts.gateConfinement);
}
