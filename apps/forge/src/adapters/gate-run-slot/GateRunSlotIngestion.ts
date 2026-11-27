/**
 * `<monitor>/gate-slots/slot-<n>`, one machine-wide gate run slot: its holder's folder on the first line, then a versioned JSON document
 * naming the process answering for it. Read, validate, map; the text read is handed back beside the verdict, so a taker removes the slot
 * only while it still holds what it judged. A slot is a holding judged by its holder, so the forms older code wrote read too: a
 * document of any version, the process identity itself as the line, or the holder line alone, which names no process.
 */
import { type ProcessIdentity, storedIdentityOf } from '../../lib/process-identity/ProcessIdentity.ts';
import { storedFileTextOf }                       from '../StoredFileText.ts';
import { StoredJsonDocumentUtil }                 from '../utils/StoredJsonDocumentUtil.ts';
import type { GateRunSlotProblem }                from './@types/GateRunSlotProblem.ts';

/** A slot's holder and the process answering for it while its gate's line has no child record: the acquirer until the launch is recorded. */
export interface GateRunHolding {
  holder:  string;
  process: ProcessIdentity | null;
}

/** `storedText` is `null` only when the file's bytes could not be read at all. */
export type GateRunSlotReading =
  | { verdict: 'readable'; holding: GateRunHolding; storedText: string }
  | { verdict: 'absent' }
  | { verdict: 'unreadable'; problem: GateRunSlotProblem; storedText: string | null };

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
    if (separatorIndex === 0 || storedText.length === 0) return { verdict: 'unreadable', problem: { code: 'names-no-holder' }, storedText };
    if (separatorIndex < 0) return { verdict: 'readable', holding: { holder: storedText, process: null }, storedText };
    const processText = storedText.slice(separatorIndex + GATE_RUN_SLOT_HOLDER_SEPARATOR.length);
    const document = StoredJsonDocumentUtil.holdingDocumentOfText(processText);
    if (document.verdict === 'unreadable') return { ...document, storedText };
    const recordedProcess = Object.hasOwn(document.document, 'process') ? document.document['process'] : document.document;
    const process = storedIdentityOf(recordedProcess);
    if (recordedProcess !== null && process === null) return { verdict: 'unreadable', problem: { code: 'field-not-a-process-identity', field: 'process' }, storedText };
    return { verdict: 'readable', holding: { holder: storedText.slice(0, separatorIndex), process }, storedText };
  }
}
