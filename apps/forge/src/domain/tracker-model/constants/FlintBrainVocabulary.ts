/** The values a `flint-brain-ended` record stores: who started the run and why it ended. */
import type { FlintBrainEndedReason, FlintBrainStarter } from '../@types/LogRecord.ts';

export const FLINT_BRAIN_STARTERS = ['bridge', 'api'] as const satisfies readonly FlintBrainStarter[];

export const FLINT_BRAIN_ENDED_REASONS = ['time', 'stopped', 'usage-limit', 'failed'] as const satisfies readonly FlintBrainEndedReason[];
