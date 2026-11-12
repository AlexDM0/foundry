/** `pipeline finding`: the pipeline agent records one thing it found in the repository, such as a script and what it means. */
import { SetupPayloadSchemas }                from '../../src/adapters/pipeline-setup/SetupPayloadSchemas.ts';
import type { CommandContext }                from '../CommandContext.ts';
import type { ArgumentParser }                from '../arguments/ArgumentParser.ts';
import { agentPayloadOf, agentSetupNamingOf } from './AgentCommandLine.ts';
import { applySetupCommand }                  from './SetupCommandLine.ts';
import { PIPELINE_AGENT_USAGE }               from './constants/PipelineUsage.ts';

export async function recordPipelineFinding(commandArguments: ArgumentParser, context: CommandContext): Promise<void> {
  const usage = PIPELINE_AGENT_USAGE.finding;
  commandArguments.rejectUnknownOptions(['file', 'json'], usage);
  const { naming, consumed } = agentSetupNamingOf(commandArguments, context, usage);
  const { value } = await agentPayloadOf(commandArguments, context, {
    kind: 'pipeline-finding-record', consumed, usage, readingOf: SetupPayloadSchemas.findingReadingOf
  });
  await applySetupCommand(commandArguments, context, { kind: 'pipeline-finding-record', ...naming, ...value });
}
