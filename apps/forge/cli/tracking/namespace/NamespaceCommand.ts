/**
 * `namespace [<name>]` prints the board's branch namespace, or sets it while the board is idle: no Overseer serving it, no job that works
 * on a branch on it and no branch left under its current names, since every one of those would go on under the old names. A namespace
 * another tracker of the repository lists is refused, and the board's own entry in that list follows the name it takes.
 */
import { readingBoardOf }                                           from '../../../src/lib/tracker-model/ReadingBoard.ts';
import { ControlService }                                           from '../../../src/services/control/ControlService.ts';
import { Baton }                                                    from '../../../src/services/overseer/Baton.ts';
import { overseerFilesIn }                                          from '../../../src/services/overseer/OverseerFiles.ts';
import { projectLocationOf }                                        from '../../../src/services/tracker/ProjectLocation.ts';
import { listTracker, readListedTrackers, repositoryTrackerListOf } from '../../../src/services/tracker/RepositoryTrackerList.ts';
import { requireProgressFile }                                      from '../../../src/services/tracker/TrackerReader.ts';
import { requireWorkspace }                                         from '../../../src/services/tracker/Workspace.ts';
import type { ControlCommandOf }                                    from '../../../src/shared/@types/ControlCommand.ts';
import { BranchNamespaceUtil, branchNamesOf }                       from '../../../src/shared/BranchNames.ts';
import { OperationRefusal }                                         from '../../../src/shared/OperationRefusal.ts';
import { PRODUCT_NAMES }                                            from '../../../src/shared/constants/ProductNames.ts';
import type { CommandContext }                                      from '../../CommandContext.ts';
import { commandControlContextOf }                                  from '../../CommandControlContext.ts';
import type { CommandHandler }                                      from '../../CommandHandler.ts';
import { openTrackerForWriting }                                    from '../../OpenTrackerForWriting.ts';
import type { ArgumentParser }                                      from '../../arguments/ArgumentParser.ts';
import { OutputUtil }                                               from '../../utils/OutputUtil.ts';

const USAGE = `${PRODUCT_NAMES.PROGRAM} namespace [<name>] [--json]`;

const KNOWN_OPTION_NAMES = ['json'];

const EXAMPLE_TICKET_ID = '<id>';

function ticketBranchExampleOf(branchNamespace: string | null): string {
  return branchNamesOf(branchNamespace).ticketBranchOf(EXAMPLE_TICKET_ID);
}

function namespaceTextOf(branchNamespace: string | null): string {
  const example = ticketBranchExampleOf(branchNamespace);
  return branchNamespace === null ? `None: the board's ticket branches are ${example}.` : `${branchNamespace}: the board's ticket branches are ${example}.`;
}

function printCurrentNamespace(commandArguments: ArgumentParser, context: CommandContext): void {
  // Built over progress.json alone, so a broken log or ticket file does not stop this read.
  const branchNamespace = readingBoardOf(requireProgressFile(requireWorkspace(context.currentDirectory)), [], []).branchNamespace();
  OutputUtil.printEntity(commandArguments, context, { branchNamespace }, namespaceTextOf(branchNamespace));
}

function refuseWhileAnOverseerServes(context: CommandContext): void {
  const { overseerDirectory } = overseerFilesIn(requireWorkspace(context.currentDirectory).trackerDirectory);
  const newest = Baton.newestBatonOf(context.platformPorts, overseerDirectory);
  if (newest.verdict !== 'live') return;
  const batonFilePath = Baton.batonFilePathFor(overseerDirectory, newest.generation);
  throw new OperationRefusal('refused', { kind: 'overseer-already-running', url: newest.record.url, batonFilePath });
}

function refuseANamespaceAnotherTrackerLists(context: CommandContext, wantedNamespace: string): void {
  const workspace = requireWorkspace(context.currentDirectory);
  const list      = repositoryTrackerListOf(workspace.rootDirectory);
  if (list === null) return;
  const reading = readListedTrackers(list);
  if (reading.verdict !== 'readable') {
    throw new OperationRefusal('refused', `The repository's tracker list ${list.files.trackerListFilePath} could not be read, so the namespace could be `
      + 'another tracker\'s. Nothing was written.');
  }
  const { trackerId } = requireProgressFile(workspace);
  const holder = reading.trackers.find((tracker) => tracker.trackerId !== trackerId && tracker.branchNamespace === wantedNamespace);
  if (holder === undefined) return;
  throw new OperationRefusal('refused', `The namespace ${wantedNamespace} is the tracker's in ${holder.prefix === '' ? 'the repository root' : `the folder ${holder.prefix}`} `
    + `of ${list.repositoryRoot}; choose another name. Nothing was written.`);
}

/** After the namespace is stored; a list that could not be written is said on standard error, since the board already took the name. */
async function listTheBoard(context: CommandContext, branchNamespace: string): Promise<void> {
  const workspace = requireWorkspace(context.currentDirectory);
  const list      = repositoryTrackerListOf(workspace.rootDirectory);
  if (list === null) return;
  const { trackerId } = requireProgressFile(workspace);
  const tracker = { trackerId, prefix: projectLocationOf(workspace.rootDirectory).projectPrefix, branchNamespace };
  const listing = await listTracker(list, tracker, context.now, context.platformPorts.processSupervision.processIsGone);
  if (listing.verdict === 'not-listed') {
    context.standardError(`The repository's tracker list ${list.files.trackerListFilePath} was not written (${listing.reason}); another tracker could take this namespace.`);
  }
}

export const namespaceCommand: CommandHandler = async (commandArguments, context) => {
  commandArguments.rejectUnknownOptions(KNOWN_OPTION_NAMES, USAGE);
  commandArguments.rejectExtraPositionals(1, USAGE);
  const wantedNamespace = commandArguments.positional();
  if (wantedNamespace === undefined) {
    printCurrentNamespace(commandArguments, context);
    return;
  }
  if (!BranchNamespaceUtil.namespaceIsWellFormed(wantedNamespace)) {
    throw new OperationRefusal(
      'refused',
      `"${wantedNamespace}" is not a namespace. Write lower-case letters and digits, with dashes only between them, at most 40 characters.\n  Usage: ${USAGE}`,
    );
  }
  refuseWhileAnOverseerServes(context);
  refuseANamespaceAnotherTrackerLists(context, wantedNamespace);
  const command: ControlCommandOf<'namespace-set'> = { kind: 'namespace-set', namespace: wantedNamespace };
  const { logged } = await openTrackerForWriting(
    commandArguments,
    context,
    (change) => ControlService.apply(command, change, commandControlContextOf(context.platformPorts)).result,
  );
  await listTheBoard(context, wantedNamespace);
  const sentence = `${OutputUtil.loggedSentencesOf(logged)}: the board's ticket branches are ${ticketBranchExampleOf(wantedNamespace)}.`;
  OutputUtil.printEntity(commandArguments, context, { branchNamespace: wantedNamespace }, sentence);
};
