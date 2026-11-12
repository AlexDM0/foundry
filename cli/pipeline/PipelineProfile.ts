/**
 * `pipeline profile <gate> <phase> [<S>]`: User's press that profiles one gate in one phase, once, from the open setup's draft when it names
 * the setup and from the stored pipeline when it does not; the Bridge's stopwatch chip and Profile again send the same command.
 */
import { GATE_PHASES }                                      from '../../src/lib/tracker-model/@types/GatePhase.ts';
import type { CommandContext }                              from '../CommandContext.ts';
import { refuseUsage }                                      from '../RecordedIncidentMove.ts';
import type { ArgumentParser }                              from '../arguments/ArgumentParser.ts';
import { SUBCOMMAND_WITH_THREE_ARGUMENTS_POSITIONAL_COUNT } from '../arguments/constants/SubcommandPositionalCounts.ts';
import { applyProfileCommand, setupIdOf }                   from './SetupCommandLine.ts';
import { PIPELINE_USAGE }                                   from './constants/PipelineUsage.ts';

export async function profilePipelineGate(commandArguments: ArgumentParser, context: CommandContext): Promise<void> {
  const usage = PIPELINE_USAGE.profile;
  commandArguments.rejectUnknownOptions(['json'], usage);
  commandArguments.rejectExtraPositionals(SUBCOMMAND_WITH_THREE_ARGUMENTS_POSITIONAL_COUNT, usage);
  const [, gateName, phaseWord, setupWord] = commandArguments.positionals();
  if (gateName === undefined || gateName.trim() === '') refuseUsage('Name the gate to profile.', usage);
  const phase = GATE_PHASES.find((candidate) => candidate === phaseWord);
  if (phase === undefined) refuseUsage(`Name the phase: ${GATE_PHASES.join(', ')}.`, usage);
  await applyProfileCommand(commandArguments, context, {
    kind: 'gate-profile-start', setupId: setupWord === undefined ? null : setupIdOf(setupWord, usage), gateName, phase
  });
}
