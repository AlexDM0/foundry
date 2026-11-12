/** The gate profile runs' closed vocabularies and their id prefix, shared by the Board's moves and the stored file's read. */
import type { GateProfileRunEnding } from '../@types/GateProfile.ts';
import type { GateProfileRunState }  from '../@types/PipelineFacts.ts';

export const GATE_PROFILE_RUN_STATES = [
  'queued', 'running', 'passed', 'red', 'cannot-run', 'timed-out', 'stopped',
] as const satisfies readonly GateProfileRunState[];

export const GATE_PROFILE_RUN_ENDINGS = ['passed', 'red', 'cannot-run', 'timed-out'] as const satisfies readonly GateProfileRunEnding[];

/** A run in these states is not over: a second press on its gate and phase refuses. */
export const UNFINISHED_GATE_PROFILE_RUN_STATES = ['queued', 'running'] as const satisfies readonly GateProfileRunState[];

export const GATE_PROFILE_RUN_ID_PREFIX = 'P';

/** The number the first run a tracker queues takes, `P1`. */
export const FIRST_GATE_PROFILE_RUN_NUMBER = 1;

export const GATE_PROFILES_FORMAT_VERSION = 1;
