/**
 * `update`: refresh what the tool wrote into a repository it already tracks, so nobody reaches for
 * `init` — a verb that reads as destructive — to pick up newer instructions. It creates
 * no tracker, so it takes neither `--project` nor `--root`, and never touches the tracker's own files.
 */
import { Baton }                                          from '../../../src/services/overseer/Baton.ts';
import { CodeVersion }                                    from '../../../src/services/overseer/CodeVersion.ts';
import { overseerFilesIn }                                from '../../../src/services/overseer/OverseerFiles.ts';
import { requireWorkspace }                               from '../../../src/services/tracker/Workspace.ts';
import { PRODUCT_NAMES }                                  from '../../../src/shared/constants/ProductNames.ts';
import { JsonTextUtil }                                   from '../../../src/shared/utils/JsonTextUtil.ts';
import type { CommandContext }                            from '../../CommandContext.ts';
import type { CommandHandler }                            from '../../CommandHandler.ts';
import { requireInstallManifestThisVersionCanReplace }    from '../../InstallVersionCheck.ts';
import { INSTALL_VERSION }                                from '../../constants/InstallVersion.ts';
import { OverseerRemote }                                 from '../../overseer/OverseerRemote.ts';
import { ProgramAnswerUtil }                              from '../../utils/ProgramAnswerUtil.ts';
import { installedFileTextsFor, installedSkillFileTexts } from '../InstalledFileGeneration.ts';
import { refuseBesideAnOlderProgram }                     from '../OlderProgramRefusal.ts';
import { refuseARetiredAgentHostsInstall }                from '../RetiredAgentHostRefusal.ts';
import {
  optOutFlagsGiven,
  recordInstallVersion,
  refreshReportLinesOf,
  refreshTrackedRepository
}                                                                             from '../TrackerRefresh.ts';
import { writeProgressPageStub } from '../WriteProgressPageStub.ts';

const USAGE = `${PRODUCT_NAMES.PROGRAM} update [--no-hooks] [--json]`;

const KNOWN_OPTION_NAMES = ['no-hooks', 'json'];

/** How `update`'s last step went: a failed Baton pass is the refusal `baton-pass-failed` instead. */
type BatonPassOutcome = 'done' | 'not-needed' | 'not-taken';

export const updateCommand: CommandHandler = async (commandArguments, context) => {
  commandArguments.rejectUnknownOptions(KNOWN_OPTION_NAMES, USAGE);
  commandArguments.rejectExtraPositionals(0, USAGE);
  const optOutFlags = optOutFlagsGiven((flagName) => commandArguments.flag(flagName));

  const answersInJson = commandArguments.flag('json');
  // Under --json only the answer reaches standard output; the report lines of the refresh go nowhere.
  const output = answersInJson ? (_line: string) => undefined : context.standardOutput;
  const workspace          = requireWorkspace(context.currentDirectory);
  refuseBesideAnOlderProgram(workspace.rootDirectory);
  requireInstallManifestThisVersionCanReplace(workspace.rootDirectory);
  refuseARetiredAgentHostsInstall('update', workspace.rootDirectory);
  const installedFileTexts = installedFileTextsFor();
  const report             = refreshTrackedRepository({
    workspace,
    installedFileTexts,
    installedSkillFileTexts: installedSkillFileTexts(),
    commandName:             'update',
    optOutFlags,
    writesTheBriefFirst:     false,
    standardError:           context.standardError,
  });

  output(`Refreshed what ${PRODUCT_NAMES.PROGRAM} manages in ${workspace.rootDirectory}; the tracker itself was not touched.`);
  for (const line of refreshReportLinesOf(report, workspace.htmlFilePath)) output(line);
  writeProgressPageStub(context.platformPorts, workspace);
  recordInstallVersion(workspace.rootDirectory);
  const batonPass = await handTheLiveOverseerToTheCodeOnDisk(context, workspace.trackerDirectory, output);
  if (answersInJson) {
    context.standardOutput(JsonTextUtil.indentedTextOf(ProgramAnswerUtil.answerOf({
      outcome: 'done', installVersion: INSTALL_VERSION, batonPass, batonPassStep: null
    })));
  }
};

/**
 * The last step of `update`: a live Overseer on other code or another install version is handed to the code on disk through the checked
 * Baton pass. A failed one exits 1 `baton-pass-failed` with the old Overseer still driving, and what `update` installed stands.
 */
async function handTheLiveOverseerToTheCodeOnDisk(context: CommandContext, trackerDirectory: string, output: (line: string) => void): Promise<BatonPassOutcome> {
  const files  = overseerFilesIn(trackerDirectory);
  const newest = Baton.newestBatonOf(context.platformPorts, files.overseerDirectory);
  if (newest.verdict !== 'live') return 'not-needed';
  if (newest.record.codeVersion === CodeVersion.onDisk() && newest.record.installVersion === INSTALL_VERSION) return 'not-needed';
  output(`Handing the Overseer at ${newest.record.url} over to the code on disk…`);
  const batonPass = await OverseerRemote.handOverTheLiveOverseer(context.platformPorts, files, false);
  if (batonPass.verdict === 'baton-passed') {
    output(`Overseer handed over to code ${batonPass.successorCodeVersion} at ${batonPass.url}.`);
    return 'done';
  }
  if (batonPass.verdict === 'not-taken') {
    output(`The Overseer at ${batonPass.record.url} did not take the Baton pass; run \`${PRODUCT_NAMES.PROGRAM} oversee restart\`.`);
    return 'not-taken';
  }
  return 'not-needed';
}
