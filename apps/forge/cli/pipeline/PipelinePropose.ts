/** `pipeline propose`: the pipeline agent's edits of the draft pipeline, `{edits: [{field, value, summary}]}`, landed as one move. */
import { SetupPayloadSchemas }                from '../../src/adapters/pipeline-setup/SetupPayloadSchemas.ts';
import type { ProposedFieldEdit }             from '../../src/shared/@types/ControlCommand.ts';
import type { CommandContext }                from '../CommandContext.ts';
import type { ArgumentParser }                from '../arguments/ArgumentParser.ts';
import { agentPayloadOf, agentSetupNamingOf } from './AgentCommandLine.ts';
import { applySetupCommand }                  from './SetupCommandLine.ts';
import { PIPELINE_AGENT_USAGE }               from './constants/PipelineUsage.ts';

export async function proposePipelineEdits(commandArguments: ArgumentParser, context: CommandContext): Promise<void> {
  const usage = PIPELINE_AGENT_USAGE.propose;
  commandArguments.rejectUnknownOptions(['file', 'json'], usage);
  const { naming, consumed } = agentSetupNamingOf(commandArguments, context, usage);
  const { payload } = await agentPayloadOf(commandArguments, context, {
    kind: 'pipeline-draft-propose', consumed, usage, readingOf: SetupPayloadSchemas.proposalReadingOf
  });
  // The schema read every edit as {field, value, summary}, so the edits are sent as written, for the applier to read again.
  await applySetupCommand(commandArguments, context, { kind: 'pipeline-draft-propose', ...naming, edits: payload['edits'] as ProposedFieldEdit[] });
}
