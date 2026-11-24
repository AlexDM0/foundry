/**
 * `pipeline setup` opens the setup record of a first pipeline, billed as chosen, at the agent step, or with `--agent` past it with its
 * pipeline agent launched; a client's control sends the same command.
 */
import { agentFrom }                      from '../AgentProgramWords.ts';
import type { CommandContext }            from '../CommandContext.ts';
import type { ArgumentParser }            from '../arguments/ArgumentParser.ts';
import { applySetupCommand, billingFrom } from './SetupCommandLine.ts';
import { PIPELINE_USAGE }                 from './constants/PipelineUsage.ts';

export async function startPipelineSetup(commandArguments: ArgumentParser, context: CommandContext): Promise<void> {
  const usage = PIPELINE_USAGE.setup;
  commandArguments.rejectUnknownOptions(['billing', 'max-budget-usd', 'agent', 'replace-unreadable', 'json'], usage);
  commandArguments.rejectExtraPositionals(1, usage);
  const agentWord = commandArguments.option('agent');
  await applySetupCommand(commandArguments, context, {
    kind:                       'pipeline-setup-start',
    billing:                    billingFrom(commandArguments, commandArguments.option('billing') ?? 'subscription', usage),
    replacesUnreadablePipeline: commandArguments.flag('replace-unreadable'),
    ...(agentWord === undefined ? {} : { agent: agentFrom(agentWord, context, usage) }),
  });
}
