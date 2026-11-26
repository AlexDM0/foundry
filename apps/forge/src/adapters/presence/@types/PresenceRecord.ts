import type { ProcessIdentity }            from '../../../lib/process-identity/ProcessIdentity.ts';
import type { StartOrigin }                from '../../../lib/tracker-model/@types/Job.ts';
import type { PRESENCE_FORMAT_VERSION }    from '../constants/PresenceFileVersions.ts';
import type { StartClassificationVerdict } from './StartClassificationVerdict.ts';

export type AbandonedPassReason = 'tracker-lock-held' | 'lock-taken-over';

/** A `crashed` ending names its crash log's number, `null` when the crash path could not write the log. */
export type PresenceEnding =
  | { kind: 'stopped' | 'handed-over'; at: string }
  | { kind: 'crashed'; component: 'hephaestus' | 'talos'; crashLogNumber: number | null; at: string };

/** `presence.json`, written whole and atomically by the main thread only. */
export interface PresenceRecord {
  presenceVersion:     typeof PRESENCE_FORMAT_VERSION;
  /** The Hephaestus lock generation this record describes. */
  generation:          number;
  process:             ProcessIdentity;
  codeVersion:         string;
  startOrigin:         StartOrigin;
  /** Local ISO time, shown only. */
  startedAt:           string;
  /** `null` until the start gate hands its classification in. */
  startClassification: StartClassificationVerdict | null;
  abandonedPasses:     {
    inARow: number;
    last:   { reason: AbandonedPassReason; detail: string; at: string } | null;
  };
  ending: PresenceEnding | null;
}
