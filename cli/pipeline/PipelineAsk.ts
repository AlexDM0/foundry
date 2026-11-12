/** `pipeline ask`: the pipeline agent asks User one setup question, with two to four options and its recommendation, and no "Other". */
import { SetupPayloadSchemas }                from '../../src/adapters/pipeline-setup/SetupPayloadSchemas.ts';
import type { CommandContext }                from '../CommandContext.ts';
import type { ArgumentParser }                from '../arguments/ArgumentParser.ts';
import { agentPayloadOf, agentSetupNamingOf } from './AgentCommandLine.ts';
import { applySetupCommand }                  from './SetupCommandLine.ts';
import { PIPELINE_AGENT_USAGE }               from './constants/PipelineUsage.ts';

export async function askPipelineQuestion(commandArguments: ArgumentParser, context: CommandContext): Promise<void> {
  const usage = PIPELINE_AGENT_USAGE.ask;
  commandArguments.rejectUnknownOptions(['file', 'json'], usage);
  const { naming, consumed } = agentSetupNamingOf(commandArguments, context, usage);
  const { value } = await agentPayloadOf(commandArguments, context, {
    kind: 'pipeline-question-ask', consumed, usage, readingOf: SetupPayloadSchemas.questionReadingOf
  });
  await applySetupCommand(commandArguments, context, {
    kind:        'pipeline-question-ask',
    ...naming,
    step:        value.step,
    subject:     value.subject,
    question:    value.question,
    context:     value.context,
    options:     [...value.optionTexts],
    recommended: [...value.recommendedLetters],
    multiple:    value.multiple,
  });
}
