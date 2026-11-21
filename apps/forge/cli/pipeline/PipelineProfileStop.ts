/** `pipeline profile-stop <P>`: a queued profile stops at once; a running one has its process tree ended by Hephaestus, with no result. */
import type { CommandContext } from '../CommandContext.ts';
import { refuseUsage }         from '../RecordedIncidentMove.ts';
import type { ArgumentParser } from '../arguments/ArgumentParser.ts';
import { applyProfileCommand } from './SetupCommandLine.ts';
import { PIPELINE_USAGE }      from './constants/PipelineUsage.ts';

/** A profile run id as the Board writes it; a command line upper-cases what it reads first. */
const PROFILE_RUN_ID_PATTERN = /^P[1-9][0-9]*$/;

export async function stopPipelineGateProfile(commandArguments: ArgumentParser, context: CommandContext): Promise<void> {
  const usage = PIPELINE_USAGE['profile-stop'];
  commandArguments.rejectUnknownOptions(['json'], usage);
  commandArguments.rejectExtraPositionals(2, usage);
  const profileRunId = commandArguments.positionals()[1]?.toUpperCase();
  if (profileRunId === undefined || !PROFILE_RUN_ID_PATTERN.test(profileRunId)) refuseUsage('Name the gate profile, as P1.', usage);
  await applyProfileCommand(commandArguments, context, { kind: 'gate-profile-stop', profileRunId });
}
