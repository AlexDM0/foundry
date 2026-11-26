/**
 * `<monitor>/gate-slots/slot-<n>`, one machine-wide gate run slot: its holder's folder on the first line, then a versioned JSON document
 * naming the process answering for it. Read, validate, map; the text read is handed back beside the verdict, so a taker that moves the slot
 * aside can tell whether it moved what it judged.
 */
import { type ProcessIdentity, storedIdentityOf } from '../../lib/process-identity/ProcessIdentity.ts';
import { storedFileTextOf }                       from '../StoredFileText.ts';
import { StoredJsonDocumentUtil }                 from '../utils/StoredJsonDocumentUtil.ts';

/** A slot's holder and the process answering for it while its gate's line has no child record: the acquirer until the launch is recorded. */
export interface GateRunHolding {
  holder:  string;
  process: ProcessIdentity | null;
}

/** `storedText` is `null` only when the file's bytes could not be read at all. */
export type GateRunSlotReading =
  | { verdict: 'readable'; holding: GateRunHolding; storedText: string }
  | { verdict: 'absent' }
  | { verdict: 'unreadable'; reason: string; storedText: string | null };

export const GATE_RUN_SLOT_FORMAT_VERSION = 1;

export const GATE_RUN_SLOT_HOLDER_SEPARATOR = '\n';

export class GateRunSlotIngestion {
  constructor(private readonly slotFilePath: string) {}

  /** Never throws. */
  read(): GateRunSlotReading {
    const stored = storedFileTextOf(this.slotFilePath);
    if (stored.verdict === 'absent') return stored;
    if (stored.verdict === 'unreadable') return { ...stored, storedText: null };
    const storedText = stored.text;
    const separatorIndex = storedText.indexOf(GATE_RUN_SLOT_HOLDER_SEPARATOR);
    if (separatorIndex <= 0) return { verdict: 'unreadable', reason: 'it holds no holder line followed by a process document', storedText };
    const processText = storedText.slice(separatorIndex + GATE_RUN_SLOT_HOLDER_SEPARATOR.length);
    const document = StoredJsonDocumentUtil.documentOfText(processText, GATE_RUN_SLOT_FORMAT_VERSION);
    if (document.verdict === 'unreadable') return { ...document, storedText };
    const recordedProcess = document.document['process'];
    const process = storedIdentityOf(recordedProcess);
    if (recordedProcess !== null && process === null) return { verdict: 'unreadable', reason: 'its "process" is not a process identity', storedText };
    return { verdict: 'readable', holding: { holder: storedText.slice(0, separatorIndex), process }, storedText };
  }
}
