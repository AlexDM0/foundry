/**
 * `pipeline setup` opens the setup record of a first pipeline with the agent's program User chose, run once first: at the billing step, or
 * with `--billing` past it with its pipeline agent launched; a client's control sends the same command.
 */
import { agentFrom }           from '../AgentProgramWords.ts';
import { billingFrom }         from '../BillingWords.ts';
import type { CommandContext } from '../CommandContext.ts';
import { refuseUsage }         from '../RecordedIncidentMove.ts';
import type { ArgumentParser } from '../arguments/ArgumentParser.ts';
import { applySetupCommand }   from './SetupCommandLine.ts';
import { PIPELINE_USAGE }      from './constants/PipelineUsage.ts';

export async function startPipelineSetup(commandArguments: ArgumentParser, context: CommandContext): Promise<void> {
  const usage = PIPELINE_USAGE.setup;
  commandArguments.rejectUnknownOptions(['billing', 'max-budget-usd', 'agent', 'replace-unreadable', 'json'], usage);
  commandArguments.rejectExtraPositionals(1, usage);
  const agentWord = commandArguments.option('agent');
  if (agentWord === undefined) refuseUsage('Name the agent\'s program: machine, or the path of the program.', usage);
  const billingWord = commandArguments.option('billing');
  if (billingWord === undefined && commandArguments.option('max-budget-usd') !== undefined) refuseUsage('--max-budget-usd goes only with api billing.', usage);
  await applySetupCommand(commandArguments, context, {
    kind:                       'pipeline-setup-start',
    agent:                      agentFrom(agentWord, context, usage),
    replacesUnreadablePipeline: commandArguments.flag('replace-unreadable'),
    ...(billingWord === undefined ? {} : { billing: billingFrom(commandArguments, billingWord, usage) }),
  });
}
