/** `pipeline undo <S> <E>` writes the base pipeline's value of that edit's field back; the edit stays listed, marked undone. */
import type { CommandContext }                            from '../CommandContext.ts';
import type { ArgumentParser }                            from '../arguments/ArgumentParser.ts';
import { SUBCOMMAND_WITH_TWO_ARGUMENTS_POSITIONAL_COUNT } from '../arguments/constants/SubcommandPositionalCounts.ts';
import { applySetupCommand, editIdOf, setupIdOf }         from './SetupCommandLine.ts';
import { PIPELINE_USAGE }                                 from './constants/PipelineUsage.ts';

export async function undoPipelineDraftEdit(commandArguments: ArgumentParser, context: CommandContext): Promise<void> {
  const usage = PIPELINE_USAGE.undo;
  commandArguments.rejectUnknownOptions(['json'], usage);
  commandArguments.rejectExtraPositionals(SUBCOMMAND_WITH_TWO_ARGUMENTS_POSITIONAL_COUNT, usage);
  const [, setupWord, editWord] = commandArguments.positionals();
  await applySetupCommand(commandArguments, context, { kind: 'pipeline-draft-undo', setupId: setupIdOf(setupWord, usage), editId: editIdOf(editWord, usage) });
}
