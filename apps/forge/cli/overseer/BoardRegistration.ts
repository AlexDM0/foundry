/**
 * What the Overseer and a start that stays off tell the monitor registry of the board: the live Overseer's pointer and the forge's presence. A
 * registry that cannot be written never fails the start, the stop or the crash; the monitor only loses its pointer.
 */
import { type MonitorRegistrationRequest, registerWithTheMonitor } from '../../src/services/tracker/MonitorRegistration.ts';
import type { Workspace }                                          from '../../src/services/tracker/Workspace.ts';
import type { CommandContext }                                     from '../CommandContext.ts';

export type BoardRegistration = Pick<MonitorRegistrationRequest, 'overseer' | 'presence'>;

export async function registerTheBoard(context: CommandContext, workspace: Workspace, { overseer, presence }: BoardRegistration): Promise<void> {
  await registerWithTheMonitor({
    workspace,
    monitorFolder:        context.platformPorts.dataFolders.monitorFolderOf(context.homeDirectory),
    temporaryDirectories: context.temporaryDirectories,
    command:              context.commandVerb,
    program:              context.programPath,
    now:                  context.now,
    lockHolderIsGone:     context.platformPorts.processSupervision.processIsGone,
    ...(overseer === undefined ? {} : { overseer }),
    ...(presence === undefined ? {} : { presence }),
  });
}
