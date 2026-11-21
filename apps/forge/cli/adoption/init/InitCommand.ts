import { randomUUID } from 'node:crypto';
import { basename }   from 'node:path';

import { ensureIgnored }                                  from '../../../src/lib/git/GitIgnore.ts';
import { LocalTimeUtil }                                  from '../../../src/lib/local-time/LocalTimeUtil.ts';
import { CONSTITUTION_FILE_PATH }                         from '../../../src/services/hephaestus/InstructionFiles.ts';
import { lockTakerOf }                                    from '../../../src/services/tracker/LockHolders.ts';
import { listTracker }                                    from '../../../src/services/tracker/RepositoryTrackerList.ts';
import { findWorkspace, workspacePathsFor }               from '../../../src/services/tracker/Workspace.ts';
import { BranchNamespaceUtil, branchNamesOf }             from '../../../src/shared/BranchNames.ts';
import { OperationRefusal }                               from '../../../src/shared/OperationRefusal.ts';
import { PRODUCT_NAMES }                                  from '../../../src/shared/constants/ProductNames.ts';
import { JsonTextUtil }                                   from '../../../src/shared/utils/JsonTextUtil.ts';
import { boardStoreIn }                                   from '../../BoardStoreOf.ts';
import type { CommandHandler }                            from '../../CommandHandler.ts';
import { requireGitAtTheFloor }                           from '../../GitVersionFloor.ts';
import { requireInstallManifestThisVersionCanReplace }    from '../../InstallVersionCheck.ts';
import { registerWrittenTracker }                         from '../../RegisterWrittenTracker.ts';
import { OutputUtil }                                     from '../../utils/OutputUtil.ts';
import { ProgramAnswerUtil }                              from '../../utils/ProgramAnswerUtil.ts';
import { installedFileTextsFor, installedSkillFileTexts } from '../InstalledFileGeneration.ts';
import type { InstalledFileTexts }                        from '../InstalledFileGeneration.ts';
import { refuseBesideAnOlderProgram }                     from '../OlderProgramRefusal.ts';
import {
  IGNORE_OUTCOME_WORDS,
  optOutFlagsGiven,
  recordInstallVersion,
  refreshReportLinesOf,
  reportLineOf,
  refreshTrackedRepository
}                                                                             from '../TrackerRefresh.ts';
import { chosenRootLineOf, initPlacementOf }                           from './InitPlacement.ts';
import { initRootDirectoryOf, refuseAnOverrideNamingAnotherDirectory } from './InitRoot.ts';

const USAGE = `${PRODUCT_NAMES.PROGRAM} init [--project <name>] [--root <path>] [--namespace <name>] [--no-hooks] [--json]`;

const KNOWN_OPTION_NAMES = ['project', 'root', 'namespace', 'no-hooks', 'json'];

const { PROGRAM, PRODUCT_OWNER_SKILL } = PRODUCT_NAMES;

/** `agentDisplayName` is the agent adapter's name for the agent whose sessions file tickets here. */
function nextStepLinesOf(agentDisplayName: string): readonly string[] {
  return [
    '',
    'Next steps:',
    `  1. Run \`${PROGRAM} start\`. It starts Hephaestus in the background.`,
    '     Hephaestus keeps running after the terminal closes; its agents run on even when it stops.',
    `  2. Ask an agent session (${agentDisplayName}) in this repository to file a ticket. It loads the ${PRODUCT_OWNER_SKILL} skill,`,
    '     files the ticket as a draft and readies it on your yes.',
    '  3. The board starts on Pipeline setup. Choose who pays, then let the pipeline agent read the repository.',
    `     Apply commits ${CONSTITUTION_FILE_PATH} to main; with Resume it starts the board.`,
    `  Stop Hephaestus with \`${PROGRAM} stop\`; \`${PROGRAM} help\` lists every command.`,
  ];
}

export const initCommand: CommandHandler = async (commandArguments, context) => {
  commandArguments.rejectUnknownOptions(KNOWN_OPTION_NAMES, USAGE);
  commandArguments.rejectExtraPositionals(0, USAGE);

  const answersInJson = commandArguments.flag('json');
  // Under --json only the answer reaches standard output: `created` for a new tracker, `refreshed` for one that existed.
  const output = answersInJson ? (_line: string) => undefined : context.standardOutput;
  const printAnswer = (outcome: 'created' | 'refreshed') => {
    if (!answersInJson) return;
    const { trackerId, project } = store.reads.requireProgress();
    context.standardOutput(JsonTextUtil.indentedTextOf(ProgramAnswerUtil.answerOf({
      outcome, trackerId, project, root: workspace.rootDirectory
    })));
  };
  const branchNamespace = commandArguments.option('namespace') ?? null;
  if (branchNamespace !== null && !BranchNamespaceUtil.namespaceIsWellFormed(branchNamespace)) {
    throw new OperationRefusal(
      'refused',
      `"${branchNamespace}" is not a namespace. Write lower-case letters and digits, with dashes only between them, at most 40 characters.\n  Usage: ${USAGE}`,
    );
  }
  const rootOption    = commandArguments.option('root');
  const rootDirectory = initRootDirectoryOf(rootOption, context.currentDirectory);
  const workspace     = workspacePathsFor(rootDirectory);
  const store         = boardStoreIn(context, workspace);
  const optOutFlags = optOutFlagsGiven((flagName) => commandArguments.flag(flagName));

  refuseAnOverrideNamingAnotherDirectory(context.currentDirectory, rootDirectory);
  requireGitAtTheFloor(rootDirectory);

  const skillFileTexts = installedSkillFileTexts(context.agentAdapter);
  // The briefs, the hook and the skills are written by the same refresh a second `init` and `update` run, so a fresh tracker and an
  // adopted one never drift.
  const refreshTheRepository = (installedFileTexts: InstalledFileTexts, { writesTheBriefFirst }: { writesTheBriefFirst: boolean }) => refreshTrackedRepository({
    workspace,
    installedFileTexts,
    installedSkillFileTexts: skillFileTexts,
    agentInstaller:          context.agentAdapter.installer,
    commandName:             'init',
    optOutFlags,
    writesTheBriefFirst,
    standardError:           context.standardError,
  });
  const reportTheRefreshOfAnExistingTracker = (installedFileTexts: InstalledFileTexts) => {
    const refresh = refreshTheRepository(installedFileTexts, { writesTheBriefFirst: false });
    output(`${PRODUCT_NAMES.PROGRAM} is already initialised in ${rootDirectory}.`);
    for (const line of refreshReportLinesOf(refresh)) output(line);
    output(`  \`${PRODUCT_NAMES.PROGRAM} update\` is the command for this refresh; \`init\` only creates a tracker.`);
    recordInstallVersion(workspace.rootDirectory);
    printAnswer('refreshed');
  };

  const existingWorkspace = findWorkspace(rootDirectory);
  if (existingWorkspace !== null && existingWorkspace.rootDirectory !== workspace.rootDirectory) {
    throw new OperationRefusal(
      'refused',
      `A tracker already governs this directory: ${existingWorkspace.trackerDirectory}. `
      + `Run \`${PRODUCT_NAMES.PROGRAM} update\` in ${existingWorkspace.rootDirectory} instead to refresh what the tracker writes into the repository.`,
    );
  }
  refuseBesideAnOlderProgram(workspace.rootDirectory);
  requireInstallManifestThisVersionCanReplace(workspace.rootDirectory);

  // Every installed text is computed before the first write, so a template that will not read leaves no tracker and no file behind.
  const installedFileTexts = installedFileTextsFor(context.agentAdapter.promptFills);
  const chosenRootLine = chosenRootLineOf(rootOption, context.currentDirectory, rootDirectory);
  if (existingWorkspace !== null) {
    if (branchNamespace !== null) {
      throw new OperationRefusal(
        'refused',
        `${PRODUCT_NAMES.PROGRAM} is already initialised in ${rootDirectory}, and \`init\` sets a namespace only on the tracker it creates. `
        + `Run \`${PRODUCT_NAMES.PROGRAM} namespace ${branchNamespace}\` there instead. Nothing was written.`,
      );
    }
    if (chosenRootLine !== null) output(chosenRootLine);
    reportTheRefreshOfAnExistingTracker(installedFileTexts);
    return;
  }
  const placement = initPlacementOf(rootDirectory, branchNamespace);
  if (chosenRootLine !== null) output(chosenRootLine);
  const trackerId = randomUUID();
  // Listed before the tracker exists: a listing whose tracker never got written is passed over as gone, while a tracker no list names
  // could later have a second tracker put above or below it.
  if (placement.listToWrite !== null) {
    const listing = await listTracker(
      placement.listToWrite,
      { trackerId, prefix: placement.location.projectPrefix, branchNamespace },
      context.now,
      lockTakerOf(context.platformPorts.processSupervision),
    );
    if (listing.verdict === 'not-listed') {
      throw new OperationRefusal(
        'refused',
        `The repository's tracker list ${placement.listToWrite.files.trackerListFilePath} was not written (${listing.reason}). Nothing else was written.`,
      );
    }
  }

  // The ignore entries go in before the tracker directory exists, so the tracker is never briefly visible to git status, and before any
  // worktree can exist.
  const ignoreOutcome = ensureIgnored(rootDirectory, PRODUCT_NAMES.DATA_FOLDER);
  ensureIgnored(rootDirectory, PRODUCT_NAMES.WORKTREES_FOLDER);
  const project  = commandArguments.option('project') ?? basename(rootDirectory);
  const creation = await store.initialise({
    project,
    startedAt: LocalTimeUtil.formatLocalIso(context.now()),
    trackerId,
    ...(branchNamespace === null ? {} : { branchNamespace }),
  });
  if (creation.verdict === 'already-exists') {
    reportTheRefreshOfAnExistingTracker(installedFileTexts);
    return;
  }
  // A ticket file left from a removed tracker is adopted as it stands, so one that will not parse is named.
  OutputUtil.reportIgnoredTicketFiles(context, store.reads.listTickets().unreadable);
  await registerWrittenTracker(context, workspace);

  const refresh = refreshTheRepository(installedFileTexts, { writesTheBriefFirst: true });

  output(`Initialised ${PRODUCT_NAMES.PROGRAM} for "${project}" in ${rootDirectory}`);
  output(`  tracker:     ${workspace.trackerDirectory}`);
  if (branchNamespace !== null) output(`  branches:    ${branchNamesOf(branchNamespace).ticketBranchOf('<id>')}`);
  output(`  brief:       ${refresh.briefFilePath}`);
  output(`  .gitignore:  ${IGNORE_OUTCOME_WORDS[ignoreOutcome]}`);
  for (const { reportLabel, line, marksTheInstall } of refresh.partLines) {
    if (!marksTheInstall) output(reportLineOf(reportLabel, line));
  }
  recordInstallVersion(workspace.rootDirectory);
  for (const line of nextStepLinesOf(context.agentAdapter.displayName)) output(line);
  printAnswer('created');
};
