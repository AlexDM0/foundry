import type { StartKind } from '../../../lib/tracker-model/@types/Job.ts';

/** What a start read of the generation before it, and what kind of start it judged that to make. */
export interface StartClassificationVerdict {
  kind:               StartKind;
  previousGeneration: number | null;
  /** Only ever true with `machine-went-down`. */
  crashSuspected:     boolean;
  /** Set only with `crashed`. */
  crashedComponent:   'hephaestus' | 'talos' | null;
  evidence: {
    presence:               'absent' | 'unreadable' | 'read';
    previousEnding:         'stopped' | 'handed-over' | 'crashed' | null;
    previousBootIdentity:   string | null;
    currentBootIdentity:    string;
    newerBatonThanPresence: boolean;
    talos:                  'none' | 'quit' | 'live' | 'lost-this-boot' | 'lost-other-boot';
    lastHeartbeatAt:        string | null;
    bootStartedAt:          string | null;
  };
}

/**
 * Whether a start may serve: it stays off after a crash, or a crash suspected before a reboot, unless the user started it. The crash log is
 * named by its own number; the crashed Baton generation is `null` when nothing names it.
 */
export type StartGateVerdict =
  | { verdict: 'serve'; classification: StartClassificationVerdict; crashLogNumber: number | null }
  | { verdict: 'stay-off'; classification: StartClassificationVerdict; crashLogNumber: number; crashedGeneration: number | null; crashLogPath: string };
