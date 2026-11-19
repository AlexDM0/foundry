import type {
  GateOutcome,
  InterruptionCause,
  JobKind,
  JobOutcome,
  JobRole,
  JobState,
  JobStopMode,
  LandingKind,
  OverseerStopReason,
  AirlockPhase,
  PipelineStepEnding,
  PipelineStepKind,
  StartKind,
  StartOrigin
} from '../@types/Job.ts';

export const JOB_KINDS = [
  'build',
  'review',
  'merge',
  'merge-agent',
  'refresh',
  'constitution-commit',
  'assistant',
  'product-owner',
  'pipeline-agent',
] as const satisfies readonly JobKind[];

export const JOB_ROLES = [
  'builder',
  'reviewer',
  're-reviewer',
  'conflict-re-reviewer',
  'assistant',
  'product-owner',
  'pipeline-agent',
] as const satisfies readonly JobRole[];

export const JOB_STATES = [
  'launching',
  'preparing',
  'running',
  'waiting-for-answer',
  'interrupted',
  'awaiting-answer',
  'in-customs',
  'gating',
  'merging-main',
  'merging',
  'landing',
  'stopping',
] as const satisfies readonly JobState[];

export const JOB_OUTCOMES = [
  'built',
  'reviewed',
  'round-granted',
  'does-not-hold',
  'resolved',
  'cannot-resolve',
  'landed',
  'integrated',
  'refreshed',
  'committed',
  'wound-down',
  'needs-declared',
  'refused',
  'package-return',
  'failed',
  'blocked',
  'replaced',
  'stopped',
  'closed',
] as const satisfies readonly JobOutcome[];

export const INTERRUPTION_CAUSES = [
  'watcher-lost',
  'agent-crashed',
  'reboot',
  'answer-delivery',
  'usage-limit',
  'handoff-red',
  'forced-stop-refused',
  'authentication-failed',
  'talos-paused',
  'lease-ended',
  'network-outage',
  'forge-stopped',
  'forge-crashed',
] as const satisfies readonly InterruptionCause[];

/** The interruption of a job whose lost child left a child tree that refused the forced stop: never resumed, the stop tried again. */
export const FORCED_STOP_REFUSED_INTERRUPTION = 'forced-stop-refused' satisfies InterruptionCause;

/** The interruption of a handoff whose gate or Customs check went red, which resumes the same session to fix it. */
export const HANDOFF_RED_INTERRUPTION = 'handoff-red' satisfies InterruptionCause;

/** The interruptions a resume counts in `crashResumes`; a reboot, an answer delivery or a usage limit is nobody's crash. */
export const CRASH_INTERRUPTION_CAUSES = ['watcher-lost', 'agent-crashed'] as const satisfies readonly InterruptionCause[];

/** The interruptions nothing resumes or replaces by itself: the job waits for User's resume, and none is counted as a crash. */
export const INTERRUPTION_CAUSES_HELD_FROM_RESUMING = ['network-outage', 'lease-ended'] as const satisfies readonly InterruptionCause[];

export const AIRLOCK_PHASES = ['merge-in', 'resolving', 're-reviewing', 'gating', 'fixing', 'committing', 'landing'] as const satisfies readonly AirlockPhase[];

export const OVERSEER_STOP_REASONS = ['stopped', 'baton-passed'] as const satisfies readonly OverseerStopReason[];

export const START_KINDS = ['first-start', 'handover', 'stopped-on-purpose', 'machine-went-down', 'crashed'] as const satisfies readonly StartKind[];

export const START_ORIGINS = ['user', 'login-item', 'successor'] as const satisfies readonly StartOrigin[];

export const JOB_STOP_MODES = ['stop', 'wind-down', 'fresh'] as const satisfies readonly JobStopMode[];

export const LANDING_KINDS = ['landed', 'integrated'] as const satisfies readonly LandingKind[];

export const GATE_OUTCOMES = ['passed', 'failed', 'cannot-run'] as const satisfies readonly GateOutcome[];

export const PIPELINE_STEP_KINDS = ['prepare', 'gate'] as const satisfies readonly PipelineStepKind[];

export const PIPELINE_STEP_ENDINGS = ['passed', 'failed', 'time-bound'] as const satisfies readonly PipelineStepEnding[];

export const JOB_ID_PREFIX = 'J';

/** The number the first job a tracker launches takes, `J1`: the lowest `nextJobId` a progress file may store. */
export const FIRST_JOB_NUMBER = 1;

/** The child instance a job's first launch spawns; a resume spawns the next one. */
export const FIRST_CHILD_INSTANCE = 1;
