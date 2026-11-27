/**
 * `namespace [<name>]` prints the board's branch namespace, or sets it while the board is idle: no Hephaestus serving it, no job that works
 * on a branch on it and no branch left under its current names, since every one of those would go on under the old names. A namespace
 * another tracker of the repository lists is refused, and the board's own entry in that list follows the name it takes.
 */
import { readingBoardOf }                                           from '../../../src/domain/tracker-model/ReadingBoard.ts';
import { hephaestusFilesIn }                                        from '../../../src/services/hephaestus/HephaestusFiles.ts';
import { HephaestusLock }                                           from '../../../src/services/hephaestus/HephaestusLock.ts';
import { projectLocationOf }                                        from '../../../src/services/tracker/ProjectLocation.ts';
import { listTracker, readListedTrackers, repositoryTrackerListOf } from '../../../src/services/tracker/RepositoryTrackerList.ts';
import { requireWorkspace }                                         from '../../../src/services/tracker/Workspace.ts';
import type { ControlCommandOf }                                    from '../../../src/shared/@types/ControlCommand.ts';
import { BranchNamespaceUtil, branchNamesOf }                       from '../../../src/shared/BranchNames.ts';
import { OperationRefusal }                                         from '../../../src/shared/OperationRefusal.ts';
import { PRODUCT_NAMES }                                            from '../../../src/shared/constants/ProductNames.ts';
import { applyCommandOfVerb }                                       from '../../ApplyCommandOfVerb.ts';
import { boardReadsOf, boardStoreIn }                               from '../../BoardStoreOf.ts';
import type { CommandContext }                                      from '../../CommandContext.ts';
import type { CommandHandler }                                      from '../../CommandHandler.ts';
import { loggingLockTakerOf }                                       from '../../StaleLockWording.ts';
import { TrackerListWording }                                       from '../../TrackerListWording.ts';
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
  // Built over the progress record alone, so a broken log or ticket does not stop this read.
  const branchNamespace = readingBoardOf(boardReadsOf(context).requireProgress(), [], []).branchNamespace();
  OutputUtil.printEntity(commandArguments, context, { branchNamespace }, namespaceTextOf(branchNamespace));
}

function refuseWhileAnHephaestusServes(context: CommandContext): void {
  const { hephaestusDirectory } = hephaestusFilesIn(requireWorkspace(context.currentDirectory).trackerDirectory);
  const newest = HephaestusLock.newestOf(context.platformPorts, hephaestusDirectory);
  if (newest.verdict !== 'live') return;
  const hephaestusLockFilePath = HephaestusLock.filePathFor(hephaestusDirectory, newest.generation);
  throw new OperationRefusal('refused', { kind: 'hephaestus-already-running', url: newest.record.url, hephaestusLockFilePath });
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
  const { trackerId } = boardStoreIn(context, workspace).reads.requireProgress();
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
  const { trackerId } = boardStoreIn(context, workspace).reads.requireProgress();
  const tracker = { trackerId, prefix: projectLocationOf(workspace.rootDirectory).projectPrefix, branchNamespace };
  const listing = await listTracker(list, tracker, context.now, loggingLockTakerOf(context.platformPorts.processSupervision, context.standardError));
  if (listing.verdict === 'not-listed') {
    const failureText = TrackerListWording.failureTextOf(listing.cause);
    context.standardError(`The repository's tracker list ${list.files.trackerListFilePath} was not written (${failureText}); another tracker could take this namespace.`);
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
  refuseWhileAnHephaestusServes(context);
  refuseANamespaceAnotherTrackerLists(context, wantedNamespace);
  const command: ControlCommandOf<'namespace-set'> = { kind: 'namespace-set', namespace: wantedNamespace };
  const { logged } = (await applyCommandOfVerb(commandArguments, context, command)).result;
  await listTheBoard(context, wantedNamespace);
  const sentence = `${OutputUtil.loggedSentencesOf(logged)}: the board's ticket branches are ${ticketBranchExampleOf(wantedNamespace)}.`;
  OutputUtil.printEntity(commandArguments, context, { branchNamespace: wantedNamespace }, sentence);
};
