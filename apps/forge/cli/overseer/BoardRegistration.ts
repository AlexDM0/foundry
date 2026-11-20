/**
 * What the Overseer and a start that stays off tell the monitor registry of the board: the live Overseer's pointer and the forge's presence. A
 * registry that cannot be written never fails the start, the stop or the crash; the monitor only loses its pointer.
 */
import { type MonitorRegistrationRequest, registerWithTheMonitor } from '../../src/services/tracker/MonitorRegistration.ts';
import type { Workspace }                                          from '../../src/services/tracker/Workspace.ts';
import type { CommandContext }                                     from '../CommandContext.ts';
import { monitorRegistrationRequestOf }                            from '../RegisterWrittenTracker.ts';

export type BoardRegistration = Pick<MonitorRegistrationRequest, 'overseer' | 'presence'>;

export async function registerTheBoard(context: CommandContext, workspace: Workspace, { overseer, presence }: BoardRegistration): Promise<void> {
  await registerWithTheMonitor({
    ...monitorRegistrationRequestOf(context, workspace),
    ...(overseer === undefined ? {} : { overseer }),
    ...(presence === undefined ? {} : { presence }),
  });
}
