/**
 * `<monitor>/agent-slots/slot-<n>`, one machine-wide agent slot: read, validate, map. The text read is handed back beside the verdict, so a
 * taker that moves the slot aside can tell whether it moved what it judged.
 */
import { type ProcessIdentity, storedIdentityOf } from '../../lib/process-identity/ProcessIdentity.ts';
import { storedFileTextOf }                       from '../StoredFileText.ts';
import { StoredJsonDocumentUtil }                 from '../utils/StoredJsonDocumentUtil.ts';

export interface AgentSlotHolding {
  trackerId:  string;
  /** The job the slot is for, or a reservation's `reserved-<n>`. */
  jobId:      string;
  hephaestus: ProcessIdentity | null;
}

/** `storedText` is `null` only when the file's bytes could not be read at all. */
export type AgentSlotReading =
  | { verdict: 'readable'; holding: AgentSlotHolding; storedText: string }
  | { verdict: 'absent' }
  | { verdict: 'unreadable'; reason: string; storedText: string | null };

export const AGENT_SLOT_FORMAT_VERSION = 2;

export class AgentSlotIngestion {
  constructor(private readonly slotFilePath: string) {}

  /** Never throws. */
  read(): AgentSlotReading {
    const stored = storedFileTextOf(this.slotFilePath);
    if (stored.verdict === 'absent') return stored;
    if (stored.verdict === 'unreadable') return { ...stored, storedText: null };
    const storedText = stored.text;
    const document = StoredJsonDocumentUtil.documentOfText(storedText, AGENT_SLOT_FORMAT_VERSION);
    if (document.verdict === 'unreadable') return { ...document, storedText };
    const { trackerId, jobId, hephaestus } = document.document;
    if (typeof trackerId !== 'string') return { verdict: 'unreadable', reason: 'its "trackerId" is not a string', storedText };
    if (typeof jobId !== 'string') return { verdict: 'unreadable', reason: 'its "jobId" is not a string', storedText };
    const identity = storedIdentityOf(hephaestus);
    if (hephaestus !== null && identity === null) return { verdict: 'unreadable', reason: 'its "hephaestus" is not a process identity', storedText };
    return { verdict: 'readable', holding: { trackerId, jobId, hephaestus: identity }, storedText };
  }
}
