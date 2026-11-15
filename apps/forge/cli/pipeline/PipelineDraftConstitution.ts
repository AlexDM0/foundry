/**
 * `pipeline draft-constitution`: the pipeline agent's whole constitution, `{markdown, sources}`, kept byte for byte. Each source names one
 * whole line of the text and how many equal lines come before it, plus one.
 */
import { SetupPayloadSchemas }                from '../../src/adapters/pipeline-setup/SetupPayloadSchemas.ts';
import type { CommandContext }                from '../CommandContext.ts';
import type { ArgumentParser }                from '../arguments/ArgumentParser.ts';
import { agentPayloadOf, agentSetupNamingOf } from './AgentCommandLine.ts';
import { applySetupCommand }                  from './SetupCommandLine.ts';
import { PIPELINE_AGENT_USAGE }               from './constants/PipelineUsage.ts';

export async function draftPipelineConstitution(commandArguments: ArgumentParser, context: CommandContext): Promise<void> {
  const usage = PIPELINE_AGENT_USAGE['draft-constitution'];
  commandArguments.rejectUnknownOptions(['file', 'json'], usage);
  const { naming, consumed } = agentSetupNamingOf(commandArguments, context, usage);
  const { value } = await agentPayloadOf(commandArguments, context, {
    kind: 'pipeline-constitution-draft', consumed, usage, readingOf: SetupPayloadSchemas.constitutionReadingOf
  });
  await applySetupCommand(commandArguments, context, {
    kind: 'pipeline-constitution-draft', ...naming, markdown: value.markdown, sources: [...value.annotations]
  });
}
