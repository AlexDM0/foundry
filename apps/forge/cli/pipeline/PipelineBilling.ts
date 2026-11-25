/** `pipeline billing <S>` changes how the open setup record's agent and the applied pipeline are billed. */
import { billingFrom }                                    from '../BillingWords.ts';
import type { CommandContext }                            from '../CommandContext.ts';
import type { ArgumentParser }                            from '../arguments/ArgumentParser.ts';
import { SUBCOMMAND_WITH_TWO_ARGUMENTS_POSITIONAL_COUNT } from '../arguments/constants/SubcommandPositionalCounts.ts';
import { applySetupCommand, setupIdOf }                   from './SetupCommandLine.ts';
import { PIPELINE_USAGE }                                 from './constants/PipelineUsage.ts';

export async function setPipelineBilling(commandArguments: ArgumentParser, context: CommandContext): Promise<void> {
  const usage = PIPELINE_USAGE.billing;
  commandArguments.rejectUnknownOptions(['max-budget-usd', 'json'], usage);
  commandArguments.rejectExtraPositionals(SUBCOMMAND_WITH_TWO_ARGUMENTS_POSITIONAL_COUNT, usage);
  const [, setupWord, mode] = commandArguments.positionals();
  await applySetupCommand(commandArguments, context, { kind: 'pipeline-setup-billing', setupId: setupIdOf(setupWord, usage), billing: billingFrom(commandArguments, mode, usage) });
}
