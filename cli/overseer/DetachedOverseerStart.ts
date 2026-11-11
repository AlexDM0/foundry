/** What `oversee` and `open` share to start the board's Overseer: the checks before any start, and the detached start itself. */
import type { GateConfinement }  from '../../src/lib/gate-confinement/GateConfinement.ts';
import type { OverseerFiles }    from '../../src/services/overseer/OverseerFiles.ts';
import type { Workspace }        from '../../src/services/tracker/Workspace.ts';
import { OperationRefusal }      from '../../src/shared/OperationRefusal.ts';
import type { CommandContext }   from '../CommandContext.ts';
import { requireGitAtTheFloor }  from '../GitVersionFloor.ts';
import { requireNoLiveOverseer } from './OverseerForeground.ts';
import { OverseerRemote }        from './OverseerRemote.ts';

export interface DetachedOverseerStartRequest {
  readonly context:       CommandContext;
  readonly workspace:     Workspace;
  readonly files:         OverseerFiles;
  readonly portArguments: readonly string[];
}

/** Before any job: where confinement is expected and missing no gate could run, so what is missing is said once rather than job by job. */
function requireGateConfinement(gateConfinement: GateConfinement): void {
  const availability = gateConfinement.availability();
  if (availability.verdict === 'unavailable') throw new OperationRefusal('refused', { kind: 'gate-confinement-unavailable', reason: availability.reason });
}

export function requireTheOverseerCanStartIn(directory: string, gateConfinement: GateConfinement): void {
  requireGitAtTheFloor(directory);
  requireGateConfinement(gateConfinement);
}

/** Returns the URL once the detached Overseer serves; the process outlives the command that started it. */
export async function startTheOverseerDetached({
  context, workspace, files, portArguments
}: DetachedOverseerStartRequest): Promise<string> {
  requireNoLiveOverseer(context.platformPorts, files);
  return OverseerRemote.startDetached(context, workspace.rootDirectory, files, portArguments);
}
