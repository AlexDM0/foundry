/** `pipeline start-over <S>` discards the open setup record; nothing of it reaches `pipeline.json`. */
import type { CommandContext }          from '../CommandContext.ts';
import type { ArgumentParser }          from '../arguments/ArgumentParser.ts';
import { applySetupCommand, setupIdOf } from './SetupCommandLine.ts';
import { PIPELINE_USAGE }               from './constants/PipelineUsage.ts';

export async function startPipelineSetupOver(commandArguments: ArgumentParser, context: CommandContext): Promise<void> {
  const usage = PIPELINE_USAGE['start-over'];
  commandArguments.rejectUnknownOptions(['json'], usage);
  commandArguments.rejectExtraPositionals(2, usage);
  await applySetupCommand(commandArguments, context, { kind: 'pipeline-setup-start-over', setupId: setupIdOf(commandArguments.positionals()[1], usage) });
}
