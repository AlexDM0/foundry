/** `pipeline continue <S> <step>`: User's Continue on the current step, the only way out of a step that needs a recheck. */
import { PIPELINE_SETUP_STEPS }                           from '../../src/lib/tracker-model/constants/PipelineSetupVocabulary.ts';
import type { CommandContext }                            from '../CommandContext.ts';
import { refuseUsage }                                    from '../RecordedIncidentMove.ts';
import type { ArgumentParser }                            from '../arguments/ArgumentParser.ts';
import { SUBCOMMAND_WITH_TWO_ARGUMENTS_POSITIONAL_COUNT } from '../arguments/constants/SubcommandPositionalCounts.ts';
import { applySetupCommand, setupIdOf }                   from './SetupCommandLine.ts';
import { PIPELINE_USAGE }                                 from './constants/PipelineUsage.ts';

export async function continuePipelineStep(commandArguments: ArgumentParser, context: CommandContext): Promise<void> {
  const usage = PIPELINE_USAGE.continue;
  commandArguments.rejectUnknownOptions(['json'], usage);
  commandArguments.rejectExtraPositionals(SUBCOMMAND_WITH_TWO_ARGUMENTS_POSITIONAL_COUNT, usage);
  const [, setupWord, stepWord] = commandArguments.positionals();
  const step = PIPELINE_SETUP_STEPS.find((candidate) => candidate === stepWord);
  if (step === undefined) refuseUsage(`Name the step: ${PIPELINE_SETUP_STEPS.join(', ')}.`, usage);
  await applySetupCommand(commandArguments, context, {
    kind: 'pipeline-setup-step', setupId: setupIdOf(setupWord, usage), step, move: 'continue'
  });
}
