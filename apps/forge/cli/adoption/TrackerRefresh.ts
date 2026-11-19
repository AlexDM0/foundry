/**
 * Writes what the tool installs into a tracked repository for `init` and `update`, walking the table in
 * `cli/adoption/constants/AgentInstall.ts` with the agent's installer, and reports per part whether its bytes changed: that is how an
 * orchestrator that read the brief earlier learns its copy is stale.
 */
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join }           from 'node:path';

import { createInstallManifestWriter }                      from '../../src/adapters/install/InstallManifestWriter.ts';
import type { AgentInstaller }                              from '../../src/lib/agent-launch/AgentInstaller.ts';
import { writeFileAtomically }                              from '../../src/lib/atomic-file/AtomicFile.ts';
import { ensureIgnored }                                    from '../../src/lib/git/GitIgnore.ts';
import type { EnsureIgnoredOutcome }                        from '../../src/lib/git/GitIgnore.ts';
import type { Workspace }                                   from '../../src/services/tracker/Workspace.ts';
import { OperationRefusal }                                 from '../../src/shared/OperationRefusal.ts';
import { PRODUCT_NAMES }                                    from '../../src/shared/constants/ProductNames.ts';
import { installedFilePathsIn, type InstalledFilePaths }    from '../InstalledFiles.ts';
import { INSTALL_VERSION }                                  from '../constants/InstallVersion.ts';
import type { InstalledFileTexts, InstalledSkillFileTexts } from './InstalledFileGeneration.ts';
import {
  AGENT_INSTALL,
  INSTALL_OPT_OUT_FLAGS,
  type InstalledFile,
  type InstalledFileName,
  type InstalledPart,
  type InstallOptOutFlag
} from './constants/AgentInstall.ts';

export const IGNORE_OUTCOME_WORDS: Readonly<Record<EnsureIgnoredOutcome, string>> = {
  'already-ignored':      'already ignored, so nothing was added',
  'appended':             'entry added',
  'no-gitignore-written': 'not written — this directory is not a git repository',
};

/** Wide enough for the longest label, `.gitignore:`, so every value starts in one column. */
const REPORT_LABEL_COLUMN_WIDTH = 13;

export interface TrackerRefreshRequest {
  workspace:               Workspace;
  installedFileTexts:      InstalledFileTexts;
  installedSkillFileTexts: InstalledSkillFileTexts;
  /** The agent adapter's, which names the folders the bundles go into and writes the agent's session-start entry. */
  agentInstaller:          AgentInstaller;
  /** The word the reader typed, so a line telling them to run something again names it. */
  commandName:             string;
  optOutFlags:             ReadonlySet<InstallOptOutFlag>;
  /** Only a fresh `init`: the brief marks the files installed, so a run cut short after it reads as unversioned and asks for a rerun. */
  writesTheBriefFirst:     boolean;
  standardError:           (text: string) => void;
}

export interface RefreshedPartLine {
  reportLabel:     string;
  line:            string;
  marksTheInstall: boolean;
}

export interface TrackerRefreshReport {
  /** The brief whose presence marks the files installed, the one a reader holds. */
  briefFilePath: string;
  /** In the table's order. */
  partLines:     readonly RefreshedPartLine[];
}

export function optOutFlagsGiven(flagIsGiven: (flagName: string) => boolean): ReadonlySet<InstallOptOutFlag> {
  return new Set(INSTALL_OPT_OUT_FLAGS.filter((flagName) => flagIsGiven(flagName)));
}

export function reportLineOf(reportLabel: string, value: string): string {
  return `  ${`${reportLabel}:`.padEnd(REPORT_LABEL_COLUMN_WIDTH)}${value}`;
}

export function refreshReportLinesOf(report: TrackerRefreshReport, htmlFilePath: string): string[] {
  return [
    ...report.partLines.map(({ reportLabel, line }) => reportLineOf(reportLabel, line)),
    reportLineOf('dashboard', htmlFilePath),
  ];
}

function fileBytesOrNothing(filePath: string): Buffer | null {
  try {
    return readFileSync(filePath);
  } catch {
    // Fail closed: a file the machine cannot read reads as one this refresh changed, never as one it left alone.
    return null;
  }
}

function bytesDiffer(before: Buffer | null, after: Buffer | null): boolean {
  if (before === null || after === null) return true;
  return !before.equals(after);
}

function fileChangedByWriting(filePath: string, text: string): boolean {
  const bytesBefore = fileBytesOrNothing(filePath);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileAtomically(filePath, text);
  return bytesDiffer(bytesBefore, fileBytesOrNothing(filePath));
}

/** A text the generation left out of a part that was not opted out is a defect of this checkout, never of the repository written to. */
function requiredTextOf(installedFileTexts: InstalledFileTexts, fileName: InstalledFileName): string {
  const text = installedFileTexts[fileName];
  if (text === undefined) throw new OperationRefusal('unrepaired', `No text was generated for the installed file ${fileName}, so it was not written.`);
  return text;
}

function lastFileOf(files: readonly InstalledFile[]): InstalledFile {
  const lastFile = files.at(-1);
  if (lastFile === undefined) throw new OperationRefusal('unrepaired', 'An installed part lists no file.');
  return lastFile;
}

/**
 * Rewritten on every refresh: the briefs ship with the tool. The line names the last brief, the one a reader holds and whose presence marks
 * the files installed, and reports a change to any of them.
 */
function refreshBriefs(files: readonly InstalledFile[], installedFilePaths: InstalledFilePaths, installedFileTexts: InstalledFileTexts): string {
  let anyBriefChanged = false;
  for (const file of files) {
    if (fileChangedByWriting(installedFilePaths[file.name], requiredTextOf(installedFileTexts, file.name))) anyBriefChanged = true;
  }
  const briefFilePath = installedFilePaths[lastFileOf(files).name];
  return anyBriefChanged ? `updated — re-read it before your next brief (${briefFilePath})` : `unchanged (${briefFilePath})`;
}

/**
 * Every file of the skill is rewritten, like the briefs; a file a user added to the folder is never touched, so one the skill dropped stays
 * behind too. Each folder is git-ignored, since it is a copy of this checkout's and the next `update` replaces it.
 */
function refreshInstructionBundles(
  { installedSkillNames }: Pick<Extract<InstalledPart, { writing: 'instruction-bundles' }>, 'installedSkillNames'>,
  rootDirectory: string,
  installedSkillFileTexts: InstalledSkillFileTexts,
  agentInstaller: AgentInstaller,
): string {
  return Object.values(installedSkillNames).map((skillName) => {
    const skillFileTexts = installedSkillFileTexts[skillName];
    if (skillFileTexts === undefined) throw new OperationRefusal('unrepaired', `No files were read for the installed skill ${skillName}, so it was not written.`);
    const folderInRepository = agentInstaller.instructionBundleFolderOf(skillName);
    const folderPath         = join(rootDirectory, folderInRepository);
    let anyFileChanged = false;
    for (const [pathInFolder, text] of skillFileTexts) {
      if (fileChangedByWriting(join(folderPath, pathInFolder), text)) anyFileChanged = true;
    }
    const ignoreOutcome = ensureIgnored(rootDirectory, folderInRepository);
    const ignoreNote    = ignoreOutcome === 'appended' ? ', .gitignore entry added' : '';
    return `${anyFileChanged ? 'updated' : 'unchanged'} (${folderPath}${ignoreNote})`;
  }).join('; ');
}

function ignoreFolders(rootDirectory: string, folderNames: readonly string[]): string {
  return folderNames.map((folderName) => `${folderName} ${IGNORE_OUTCOME_WORDS[ensureIgnored(rootDirectory, folderName)]}`).join('; ');
}

/** Touches nothing the tracker holds: not `progress.json`, not a ticket, not the log. */
export function refreshTrackedRepository(request: TrackerRefreshRequest): TrackerRefreshReport {
  const {
    workspace, installedFileTexts, installedSkillFileTexts, agentInstaller, commandName, optOutFlags, writesTheBriefFirst, standardError
  } = request;
  const installedFilePaths = installedFilePathsIn(workspace.rootDirectory);
  const { parts }          = AGENT_INSTALL;
  const briefsPart         = parts.find((part) => part.writing === 'briefs');
  if (briefsPart?.writing !== 'briefs') throw new OperationRefusal('unrepaired', 'The install lists no briefs.');

  function refreshedLineOf(part: InstalledPart): string {
    // Opting out comes first, or keeping current an entry a shared settings file already holds would write into a file colleagues share on
    // behalf of a reader who asked for no settings file to be touched at all.
    if (part.optOutFlag !== null && optOutFlags.has(part.optOutFlag)) return `left alone (--${part.optOutFlag})`;
    switch (part.writing) {
      case 'briefs':
        return refreshBriefs(part.files, installedFilePaths, installedFileTexts);
      case 'session-start':
        return agentInstaller.refreshSessionStart(workspace.rootDirectory, part.command, `${PRODUCT_NAMES.PROGRAM} ${commandName}`, standardError);
      case 'instruction-bundles':
        return refreshInstructionBundles(part, workspace.rootDirectory, installedSkillFileTexts, agentInstaller);
      case 'ignored-folders':
        return ignoreFolders(workspace.rootDirectory, part.folderNames);
    }
  }

  // The briefs go last, so a write that fails before them leaves the brief's `updated` for the rerun to report, unless a fresh init
  // writes them first to mark the files installed.
  const writeOrder = [
    ...parts.filter((part) => writesTheBriefFirst && part.writing === 'briefs'),
    ...parts.filter((part) => part.writing !== 'briefs'),
    ...parts.filter((part) => !writesTheBriefFirst && part.writing === 'briefs'),
  ];
  const lineByPart = new Map<InstalledPart, string>();
  for (const part of writeOrder) lineByPart.set(part, refreshedLineOf(part));

  return {
    briefFilePath: installedFilePaths[lastFileOf(briefsPart.files).name],
    partLines:     parts.map((part) => ({
      reportLabel:     part.reportLabel,
      line:            lineByPart.get(part) ?? '',
      marksTheInstall: part === briefsPart,
    })),
  };
}

/** Called last by `init` and `update`, after every other write, so a refresh cut short leaves the old version and commands keep asking for `update`. */
export function recordInstallVersion(rootDirectory: string): void {
  createInstallManifestWriter(installedFilePathsIn(rootDirectory).installManifest).write({ installVersion: INSTALL_VERSION });
}
