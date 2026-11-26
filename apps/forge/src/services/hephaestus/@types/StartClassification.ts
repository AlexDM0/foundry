import type { StartClassificationVerdict } from '../../../adapters/presence/@types/StartClassificationVerdict.ts';

/**
 * Whether a start may serve: it stays off after a crash, or a crash suspected before a reboot, unless the user started it. The crash log is
 * named by its own number; the crashed Hephaestus lock generation is `null` when nothing names it.
 */
export type StartGateVerdict =
  | { verdict: 'serve'; classification: StartClassificationVerdict; crashLogNumber: number | null }
  | { verdict: 'stay-off'; classification: StartClassificationVerdict; crashLogNumber: number; crashedGeneration: number | null; crashLogPath: string };
