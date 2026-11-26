/**
 * `update`: refresh what the tool wrote into a repository it already tracks, so nobody reaches for
 * `init` — a verb that reads as destructive — to pick up newer instructions. It creates
 * no tracker, so it takes neither `--project` nor `--root`, and never touches the tracker's own files.
 */
import { CodeVersion }                                    from '../../../src/services/hephaestus/CodeVersion.ts';
import { hephaestusFilesIn }                              from '../../../src/services/hephaestus/HephaestusFiles.ts';
import { HephaestusLock }                                 from '../../../src/services/hephaestus/HephaestusLock.ts';
import { requireWorkspace }                               from '../../../src/services/tracker/Workspace.ts';
import { PRODUCT_NAMES }                                  from '../../../src/shared/constants/ProductNames.ts';
import { JsonTextUtil }                                   from '../../../src/shared/utils/JsonTextUtil.ts';
import type { CommandContext }                            from '../../CommandContext.ts';
import type { CommandHandler }                            from '../../CommandHandler.ts';
import { HephaestusRemote }                               from '../../HephaestusRemote.ts';
import { requireInstallManifestThisVersionCanReplace }    from '../../InstallVersionCheck.ts';
import { INSTALL_VERSION }                                from '../../constants/InstallVersion.ts';
import { ProgramAnswerUtil }                              from '../../utils/ProgramAnswerUtil.ts';
import { installedFileTextsFor, installedSkillFileTexts } from '../InstalledFileGeneration.ts';
import {
  optOutFlagsGiven,
  recordInstallVersion,
  refreshReportLinesOf,
  refreshTrackedRepository
}                                                                             from '../TrackerRefresh.ts';

const USAGE = `${PRODUCT_NAMES.PROGRAM} update [--no-hooks] [--json]`;

const KNOWN_OPTION_NAMES = ['no-hooks', 'json'];

/**
 * How `update`'s last step went. A restart the live Hephaestus did not take is `failed` at the step `restart-not-taken`, at exit 0, with the
 * old Hephaestus still driving; one that failed after it was taken is the refusal `restart-failed` instead.
 */
interface RestartOutcome {
  restart:     'done' | 'not-needed' | 'failed';
  restartStep: 'restart-not-taken' | null;
}

const RESTART_NOT_NEEDED: RestartOutcome = { restart: 'not-needed', restartStep: null };

export const updateCommand: CommandHandler = async (commandArguments, context) => {
  commandArguments.rejectUnknownOptions(KNOWN_OPTION_NAMES, USAGE);
  commandArguments.rejectExtraPositionals(0, USAGE);
  const optOutFlags = optOutFlagsGiven((flagName) => commandArguments.flag(flagName));

  const answersInJson = commandArguments.flag('json');
  // Under --json only the answer reaches standard output; the report lines of the refresh go nowhere.
  const output = answersInJson ? (_line: string) => undefined : context.standardOutput;
  const workspace          = requireWorkspace(context.currentDirectory);
  requireInstallManifestThisVersionCanReplace(workspace.rootDirectory);
  const installedFileTexts = installedFileTextsFor(context.agentAdapter.promptFills);
  const report             = refreshTrackedRepository({
    workspace,
    installedFileTexts,
    installedSkillFileTexts: installedSkillFileTexts(context.agentAdapter),
    agentInstaller:          context.agentAdapter.installer,
    commandName:             'update',
    optOutFlags,
    writesTheBriefFirst:     false,
    standardError:           context.standardError,
  });

  output(`Refreshed what ${PRODUCT_NAMES.PROGRAM} manages in ${workspace.rootDirectory}; the tracker itself was not touched.`);
  for (const line of refreshReportLinesOf(report)) output(line);
  recordInstallVersion(workspace.rootDirectory);
  const restartOutcome = await handTheLiveHephaestusToTheCodeOnDisk(context, workspace.trackerDirectory, output);
  if (answersInJson) {
    context.standardOutput(JsonTextUtil.indentedTextOf(ProgramAnswerUtil.answerOf({ outcome: 'done', installVersion: INSTALL_VERSION, ...restartOutcome })));
  }
};

/**
 * The last step of `update`: a live Hephaestus on other code or another install version is handed to the code on disk through the checked
 * restart. A failed one exits 1 `restart-failed` with the old Hephaestus still driving, and what `update` installed stands.
 */
async function handTheLiveHephaestusToTheCodeOnDisk(context: CommandContext, trackerDirectory: string, output: (line: string) => void): Promise<RestartOutcome> {
  const files  = hephaestusFilesIn(trackerDirectory);
  const newest = HephaestusLock.newestOf(context.platformPorts, files.hephaestusDirectory);
  if (newest.verdict !== 'live') return RESTART_NOT_NEEDED;
  if (newest.record.codeVersion === CodeVersion.onDisk() && newest.record.installVersion === INSTALL_VERSION) return RESTART_NOT_NEEDED;
  output(`Handing Hephaestus at ${newest.record.url} over to the code on disk…`);
  const restart = await HephaestusRemote.restartTheLiveHephaestus(context.platformPorts, files, false);
  if (restart.verdict === 'restarted') {
    output(`Hephaestus handed over to code ${restart.successorCodeVersion} at ${restart.url}.`);
    return { restart: 'done', restartStep: null };
  }
  if (restart.verdict === 'not-taken') {
    output(`Hephaestus at ${restart.record.url} did not take the restart; run \`${PRODUCT_NAMES.PROGRAM} restart\`.`);
    return { restart: 'failed', restartStep: 'restart-not-taken' };
  }
  return RESTART_NOT_NEEDED;
}
