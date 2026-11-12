/** `pipeline resume <S>` opens the record's pipeline agent again, its snapshot moved to main's tip when main moved since. */
import type { CommandContext }          from '../CommandContext.ts';
import type { ArgumentParser }          from '../arguments/ArgumentParser.ts';
import { applySetupCommand, setupIdOf } from './SetupCommandLine.ts';
import { PIPELINE_USAGE }               from './constants/PipelineUsage.ts';

export async function resumePipelineSetup(commandArguments: ArgumentParser, context: CommandContext): Promise<void> {
  const usage = PIPELINE_USAGE.resume;
  commandArguments.rejectUnknownOptions(['json'], usage);
  commandArguments.rejectExtraPositionals(2, usage);
  await applySetupCommand(commandArguments, context, { kind: 'pipeline-setup-resume', setupId: setupIdOf(commandArguments.positionals()[1], usage) });
}
