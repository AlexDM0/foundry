/**
 * `namespace [<name>]` prints the board's branch namespace, or sets it while the board is idle: no Overseer serving it, no job that works
 * on a branch on it and no branch left under its current names, since every one of those would go on under the old names. A namespace
 * another tracker of the repository lists is refused, and the board's own entry in that list follows the name it takes.
 */
import { GitProcess }                                                      from '../../../src/lib/git/GitProcess.ts';
import type { JobKind }                                                    from '../../../src/lib/tracker-model/@types/Job.ts';
import { readingBoardOf }                                                  from '../../../src/lib/tracker-model/ReadingBoard.ts';
import { Baton }                                                           from '../../../src/services/overseer/Baton.ts';
import { overseerFilesIn }                                                 from '../../../src/services/overseer/OverseerFiles.ts';
import type { BoardTransaction }                                           from '../../../src/services/tracker/BoardTransaction.ts';
import { projectLocationOf }                                               from '../../../src/services/tracker/ProjectLocation.ts';
import { listTracker, readListedTrackers, repositoryTrackerListOf }        from '../../../src/services/tracker/RepositoryTrackerList.ts';
import { requireProgressFile }                                             from '../../../src/services/tracker/TrackerReader.ts';
import { requireWorkspace }                                                from '../../../src/services/tracker/Workspace.ts';
import { type BranchNamespaceRefusal, BranchNamespaceUtil, branchNamesOf } from '../../../src/shared/BranchNames.ts';
import { OperationRefusal }                                                from '../../../src/shared/OperationRefusal.ts';
import { PRODUCT_NAMES }                                                   from '../../../src/shared/constants/ProductNames.ts';
import type { CommandContext }                                             from '../../CommandContext.ts';
import type { CommandHandler }                                             from '../../CommandHandler.ts';
import { openTrackerForWriting }                                           from '../../OpenTrackerForWriting.ts';
import type { ArgumentParser }                                             from '../../arguments/ArgumentParser.ts';
import { OutputUtil }                                                      from '../../utils/OutputUtil.ts';

const USAGE = `${PRODUCT_NAMES.PROGRAM} namespace [<name>] [--json]`;

const KNOWN_OPTION_NAMES = ['json'];

const BRANCH_LIST_ARGUMENTS = ['for-each-ref', '--format=%(refname:short)', 'refs/heads'] as const;

const EXAMPLE_TICKET_ID = '<id>';

/**
 * The Assistant and the product owner work on no branch, and an Overseer's stop leaves its Assistant on the board while the next start
 * boots a new one, so counting them would refuse a namespace on every board an Overseer ever served.
 */
const JOB_KINDS_ON_NO_BRANCH: readonly JobKind[] = ['assistant', 'product-owner'];

function ticketBranchExampleOf(branchNamespace: string | null): string {
  return branchNamesOf(branchNamespace).ticketBranchOf(EXAMPLE_TICKET_ID);
}

function namespaceTextOf(branchNamespace: string | null): string {
  const example = ticketBranchExampleOf(branchNamespace);
  return branchNamespace === null ? `None: the board's ticket branches are ${example}.` : `${branchNamespace}: the board's ticket branches are ${example}.`;
}

function refusalTextOf(refusal: BranchNamespaceRefusal, wantedNamespace: string): string {
  switch (refusal.reason) {
    case 'branch-blocks-namespace':
      return `The branch ${refusal.branch} leaves git no room for branches named ${ticketBranchExampleOf(wantedNamespace)}; rename it, or choose another name.`;
    case 'namespace-has-branches':
      return `The namespace ${wantedNamespace} already holds the branches ${refusal.branches.join(', ')}, so it is another board's; choose another name.`;
    case 'board-has-branches':
      return `The board's branches ${refusal.branches.join(', ')} are under its current names; land or remove them first.`;
  }
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

/** In the hold, so no job starts between the check and the write. */
function setNamespace(change: BoardTransaction, wantedNamespace: string) {
  const { board } = change;
  const jobsOnBranches = board.jobs().filter((job) => !JOB_KINDS_ON_NO_BRANCH.includes(job.kind));
  if (jobsOnBranches.length > 0) {
    throw new OperationRefusal(
      'refused',
      `The board has ${jobsOnBranches.length} job(s) on it, which run under its current branch names; let them end first. Nothing was written.`
    );
  }
  const branchList = GitProcess.run(change.workspace.rootDirectory, BRANCH_LIST_ARGUMENTS);
  if (!GitProcess.succeeded(branchList)) {
    throw new OperationRefusal('refused', `git did not list the branches (${GitProcess.failureReasonOf(branchList, BRANCH_LIST_ARGUMENTS)}). Nothing was written.`);
  }
  const branches = branchList.standardOutput.split('\n').filter((branch) => branch !== '');
  const refusal  = BranchNamespaceUtil.refusalOf(branches, branchNamesOf(board.branchNamespace()), wantedNamespace);
  if (refusal !== null) throw new OperationRefusal('refused', `${refusalTextOf(refusal, wantedNamespace)} Nothing was written.`);
  return board.setBranchNamespace(wantedNamespace, change.at);
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
  const { logged } = await openTrackerForWriting(commandArguments, context, (change) => setNamespace(change, wantedNamespace));
  await listTheBoard(context, wantedNamespace);
  const sentence = `${OutputUtil.loggedSentencesOf(logged)}: the board's ticket branches are ${ticketBranchExampleOf(wantedNamespace)}.`;
  OutputUtil.printEntity(commandArguments, context, { branchNamespace: wantedNamespace }, sentence);
};
