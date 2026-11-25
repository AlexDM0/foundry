/** A verb's one control command, applied through the store's command face: the `--at` stamp and the skipped-file report are the command line's. */
import { AgentCommandPreparation }                           from '../src/services/control/AgentCommandPreparation.ts';
import type { ControlResultOf }                              from '../src/services/control/ControlService.ts';
import { hephaestusFilesIn }                                 from '../src/services/hephaestus/HephaestusFiles.ts';
import { HephaestusLock }                                    from '../src/services/hephaestus/HephaestusLock.ts';
import type { CommandWritten }                               from '../src/services/store/BoardStore.ts';
import type { ControlCommand }                               from '../src/shared/@types/ControlCommand.ts';
import { OperationRefusal }                                  from '../src/shared/OperationRefusal.ts';
import { HEPHAESTUS_NUDGE_TIMEOUT_MILLISECONDS }             from '../src/shared/constants/HephaestusLimits.ts';
import { agentCommandPreparationContextOf, preparedForgeAt } from './AgentCommandContext.ts';
import { boardStoreOf }                                      from './BoardStoreOf.ts';
import type { CommandContext }                               from './CommandContext.ts';
import { commandControlContextOf }                           from './CommandControlContext.ts';
import { registerWrittenTracker }                            from './RegisterWrittenTracker.ts';
import type { ArgumentParser }                               from './arguments/ArgumentParser.ts';
import { NextLineUtil }                                      from './utils/NextLineUtil.ts';
import { OptionValueUtil }                                   from './utils/OptionValueUtil.ts';
import { OutputUtil }                                        from './utils/OutputUtil.ts';

/**
 * After the lock is released, so the pass it wakes can take it: a body-less `POST /api/nudge` to the live Hephaestus lock's URL. Silent whatever
 * happens, since Hephaestus's watch of the data folder notices the write anyway; the verb itself only recorded.
 */
async function nudgeHephaestus(context: CommandContext, trackerDirectory: string): Promise<void> {
  const newest = HephaestusLock.newestOf(context.platformPorts, hephaestusFilesIn(trackerDirectory).hephaestusDirectory);
  if (newest.verdict !== 'live') return;
  try {
    await fetch(new URL('api/nudge', newest.record.url), { method: 'POST', signal: AbortSignal.timeout(HEPHAESTUS_NUDGE_TIMEOUT_MILLISECONDS) });
  } catch {
    // Best effort: a Hephaestus busy, stopping or gone is woken by its watch or its sweep.
  }
}

export async function applyCommandOfVerb<Command extends ControlCommand>(
  commandArguments: ArgumentParser,
  context: CommandContext,
  command: Command,
): Promise<CommandWritten<ControlResultOf<Command['kind']>>> {
  // A relayed verb ended at its Hatch; one reaching the store under a job wrote something no control command carries.
  if (context.job !== undefined) {
    throw new OperationRefusal('refused', { kind: 'verb-not-relayable', verb: context.commandVerb, jobId: context.job.jobId });
  }
  const { workspace, store } = boardStoreOf(context);
  const at      = OptionValueUtil.atStampFrom(commandArguments, context.now());
  const preparationContext = agentCommandPreparationContextOf(context, preparedForgeAt(context, workspace.rootDirectory, store.reads));
  const prepared = await AgentCommandPreparation.preparedCommandOf(command, preparationContext) as Command;
  const written = await store.commands.apply({ command: prepared, at, context: commandControlContextOf(context.platformPorts) });
  // The store is already written, so a skipped file never fails the command: exit 0, named on standard error.
  OutputUtil.reportIgnoredTicketFiles(context, written.unreadableRecords.tickets);
  OutputUtil.reportIgnoredEpicFiles(context, written.unreadableRecords.epics);
  OutputUtil.reportIgnoredTicketDocumentRecords(context, written.unreadableRecords.ticketDocuments);
  await registerWrittenTracker(context, workspace);
  await nudgeHephaestus(context, workspace.trackerDirectory);
  return written;
}

/** The Next line is read from the Board just written, which only this invocation holds, so it never predates the move. */
export async function applyCommandOfVerbThenReadNextLine<Command extends ControlCommand>(
  commandArguments: ArgumentParser,
  context: CommandContext,
  command: Command,
): Promise<{ written: CommandWritten<ControlResultOf<Command['kind']>>; nextLine: string }> {
  const written = await applyCommandOfVerb(commandArguments, context, command);
  return { written, nextLine: NextLineUtil.nextLineOf(written.board) };
}
