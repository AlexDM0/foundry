/**
 * Whose confinement word `status --json` prints: the live Hephaestus's, read with its token, since this process may sit in a sandbox that
 * fails its own probe; this process's own probe only when no Hephaestus answers with a word.
 */
import type { ConfinementVerdict, GateConfinement } from '../../../src/lib/gate-confinement/GateConfinement.ts';
import { Baton }                                    from '../../../src/services/hephaestus/Baton.ts';
import { hephaestusFilesIn }                        from '../../../src/services/hephaestus/HephaestusFiles.ts';
import type { Workspace }                           from '../../../src/services/tracker/Workspace.ts';
import type { CommandContext }                      from '../../CommandContext.ts';
import type { ConfinementInForce }                  from '../../StatusDocuments.ts';
import { HephaestusRemote }                         from '../../hephaestus/HephaestusRemote.ts';

const CONFINEMENT_VERDICTS: Readonly<Record<ConfinementVerdict, true>> = { confined: true, unavailable: true, 'unconfined-by-design': true };

function isConfinementVerdict(word: unknown): word is ConfinementVerdict {
  return typeof word === 'string' && Object.hasOwn(CONFINEMENT_VERDICTS, word);
}

/** `hephaestusState` is the live Hephaestus's `/api/state` document, or `null` when none answered. */
export function confinementInForceOf(hephaestusState: unknown, ownProbe: GateConfinement): ConfinementInForce {
  const hephaestusWord = typeof hephaestusState === 'object' && hephaestusState !== null ? (hephaestusState as { confinement?: unknown }).confinement : null;
  return isConfinementVerdict(hephaestusWord)
    ? { confinement: hephaestusWord, confinementSource: 'hephaestus' }
    : { confinement: ownProbe.availability().verdict, confinementSource: 'this-process' };
}

export async function readConfinementInForce(context: Pick<CommandContext, 'platformPorts'>, workspace: Workspace): Promise<ConfinementInForce> {
  const newest        = Baton.newestBatonOf(context.platformPorts, hephaestusFilesIn(workspace.trackerDirectory).hephaestusDirectory);
  const hephaestusState = newest.verdict === 'live' ? await HephaestusRemote.stateOf(newest.record) : null;
  return confinementInForceOf(hephaestusState, context.platformPorts.gateConfinement);
}
