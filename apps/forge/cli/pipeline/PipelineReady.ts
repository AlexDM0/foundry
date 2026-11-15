/** `pipeline ready <step>`: the pipeline agent suggests that User may continue the current step; it never moves a step. */
import { SETUP_QUESTION_STEPS } from '../../src/lib/tracker-model/constants/PipelineSetupVocabulary.ts';
import type { CommandContext }  from '../CommandContext.ts';
import { refuseUsage }          from '../RecordedIncidentMove.ts';
import type { ArgumentParser }  from '../arguments/ArgumentParser.ts';
import { agentSetupNamingOf }   from './AgentCommandLine.ts';
import { applySetupCommand }    from './SetupCommandLine.ts';
import { PIPELINE_AGENT_USAGE } from './constants/PipelineUsage.ts';

export async function suggestPipelineStepReady(commandArguments: ArgumentParser, context: CommandContext): Promise<void> {
  const usage = PIPELINE_AGENT_USAGE.ready;
  commandArguments.rejectUnknownOptions(['json'], usage);
  const { naming, consumed } = agentSetupNamingOf(commandArguments, context, usage);
  commandArguments.rejectExtraPositionals(consumed + 1, usage);
  const stepWord = commandArguments.positionals()[consumed];
  const step     = SETUP_QUESTION_STEPS.find((candidate) => candidate === stepWord);
  if (step === undefined) refuseUsage(`Name the step: ${SETUP_QUESTION_STEPS.join(', ')}.`, usage);
  await applySetupCommand(commandArguments, context, { kind: 'pipeline-step-ready', ...naming, step });
}
