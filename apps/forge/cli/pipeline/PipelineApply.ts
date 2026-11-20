/**
 * `pipeline apply <S> --revision <n> [--resume]`: Apply of the draft User read. While main lacks the draft's constitution the request
 * waits for its commit; otherwise the pipeline is stored at once and the record closes. Applying the same revision again changes nothing.
 */
import { applyCommandOfVerb }      from '../ApplyCommandOfVerb.ts';
import type { CommandContext }     from '../CommandContext.ts';
import { hatchWhenUnderJob }       from '../HatchUnderJob.ts';
import type { ArgumentParser }     from '../arguments/ArgumentParser.ts';
import { OutputUtil }              from '../utils/OutputUtil.ts';
import { revisionFrom, setupIdOf } from './SetupCommandLine.ts';
import { PIPELINE_USAGE }          from './constants/PipelineUsage.ts';

export async function applyPipelineSetup(commandArguments: ArgumentParser, context: CommandContext): Promise<void> {
  const usage = PIPELINE_USAGE.apply;
  commandArguments.rejectUnknownOptions(['revision', 'resume', 'json'], usage);
  commandArguments.rejectExtraPositionals(2, usage);
  const command = {
    kind:          'pipeline-apply',
    setupId:       setupIdOf(commandArguments.positionals()[1], usage),
    draftRevision: revisionFrom(commandArguments, usage),
    resumesBoard:  commandArguments.flag('resume'),
  } as const;
  await hatchWhenUnderJob(context, command);
  const applied = (await applyCommandOfVerb(commandArguments, context, command)).result;
  const humanLine = applied.logged.length > 0
    ? OutputUtil.loggedSentencesOf(applied.logged)
    : `Pipeline setup ${command.setupId} draft revision ${command.draftRevision} `
      + `${applied.outcome === 'already-applied' ? 'was already applied' : 'already waits for its constitution commit'}.`;
  OutputUtil.printEntity(commandArguments, context, { outcome: applied.outcome, setup: applied.setup, logged: applied.logged }, humanLine);
}
