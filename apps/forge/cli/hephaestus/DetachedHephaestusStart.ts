/**
 * What the forms of `start` share to start the board's Hephaestus: the repository it starts in, the checks before any start, and the detached
 * start itself.
 */
import { resolve } from 'node:path';

import type { GateConfinement }                                          from '../../src/lib/gate-confinement/GateConfinement.ts';
import type { HephaestusFiles }                                          from '../../src/services/hephaestus/HephaestusFiles.ts';
import { createUnreadableBoardFiles }                                    from '../../src/services/hephaestus/UnreadableBoardFiles.ts';
import type { Workspace }                                                from '../../src/services/tracker/Workspace.ts';
import { OperationRefusal }                                              from '../../src/shared/OperationRefusal.ts';
import { boardStoreIn }                                                  from '../BoardStoreOf.ts';
import type { CommandContext }                                           from '../CommandContext.ts';
import { requireGitAtTheFloor }                                          from '../GitVersionFloor.ts';
import type { ArgumentParser }                                           from '../arguments/ArgumentParser.ts';
import { hephaestusLoggerOf, requireNoLiveHephaestus }                   from './HephaestusForeground.ts';
import { HephaestusRemote }                                              from './HephaestusRemote.ts';
import { type StartOriginByHand, admitTheStart, startOriginArgumentsOf } from './StartGateAdmission.ts';

export interface DetachedHephaestusStartRequest {
  readonly context:       CommandContext;
  readonly workspace:     Workspace;
  readonly files:         HephaestusFiles;
  readonly portArguments: readonly string[];
  readonly startOrigin:   StartOriginByHand;
}

/** Before any job: where confinement is expected and missing no gate could run, so what is missing is said once rather than job by job. */
function requireGateConfinement(gateConfinement: GateConfinement): void {
  const availability = gateConfinement.availability();
  if (availability.verdict === 'unavailable') throw new OperationRefusal('refused', { kind: 'gate-confinement-unavailable', reason: availability.reason });
}

export function requireHephaestusCanStartIn(directory: string, gateConfinement: GateConfinement): void {
  requireGitAtTheFloor(directory);
  requireGateConfinement(gateConfinement);
}

/**
 * Returns the URL once the detached Hephaestus serves; the process outlives the command that started it. The start gate runs here first, so a
 * start that stays off is refused before any spawn; the child runs it again and is the authority.
 */
export async function startHephaestusDetached({
  context, workspace, files, portArguments, startOrigin
}: DetachedHephaestusStartRequest): Promise<string> {
  requireNoLiveHephaestus(context.platformPorts, files);
  // The child reports a board file it cannot read: only a serving Hephaestus has a board header to warn in.
  const unreadableBoardFiles = createUnreadableBoardFiles(() => undefined);
  await admitTheStart({
    context, workspace, boardStore: boardStoreIn(context, workspace), files, origin: { startOrigin }, log: hephaestusLoggerOf(context, files), unreadableBoardFiles
  });
  return HephaestusRemote.startDetached(context, workspace.rootDirectory, files, [...portArguments, ...startOriginArgumentsOf(startOrigin)]);
}

/** `--repository` stands in for the working directory, which a Windows Run entry cannot set; a relative path resolves against it. */
export function startContextOf(commandArguments: ArgumentParser, context: CommandContext): CommandContext {
  const repository = commandArguments.option('repository');
  return repository === undefined ? context : { ...context, currentDirectory: resolve(context.currentDirectory, repository) };
}
