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
    presence:                        'absent' | 'unreadable' | 'read';
    previousEnding:                  'stopped' | 'handed-over' | 'crashed' | null;
    previousBootIdentity:            string | null;
    currentBootIdentity:             string;
    newerHephaestusLockThanPresence: boolean;
    talos:                           'none' | 'quit' | 'live' | 'lost-this-boot' | 'lost-other-boot';
    lastHeartbeatAt:                 string | null;
    bootStartedAt:                   string | null;
  };
}
