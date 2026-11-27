/** `<data>/hephaestus/lock-<generation>.json`, the record of the Hephaestus that holds a board: read, validate, map. */
import { JsonRecordUtil }         from '../../lib/json-record/JsonRecordUtil.ts';
import { storedFileTextOf }       from '../StoredFileText.ts';
import { StoredJsonDocumentUtil } from '../utils/StoredJsonDocumentUtil.ts';
import { StoredValueUtil }        from '../utils/StoredValueUtil.ts';

export interface HephaestusLockFileRecord {
  processId:            number;
  processStartStamp:    string;
  bootIdentity:         string;
  port:                 number;
  url:                  string;
  tokenFile:            string;
  codeVersion:          string;
  installVersion:       number;
  talosProtocolVersion: number;
}

/** The process a Hephaestus lock names and how to reach it: all a stop needs, and all an unreadable lock is ever read for. */
export interface HephaestusLockHolder {
  processId:         number;
  processStartStamp: string;
  bootIdentity:      string;
  url:               string;
  tokenFile:         string | null;
}

/**
 * `namedHolder`: the process an unreadable lock's JSON still names, as the lock of a Hephaestus running older code does, so a live one is
 * judged live and never taken over. It is no lock record: nothing else of the file is read.
 */
export type HephaestusLockFileReading =
  | { verdict: 'readable'; record: HephaestusLockFileRecord }
  | { verdict: 'absent' }
  | { verdict: 'unreadable'; reason: string; namedHolder: HephaestusLockHolder | null };

export const HEPHAESTUS_LOCK_FORMAT_VERSION = 1;

const NUMBER_FIELDS = ['processId', 'port', 'installVersion', 'talosProtocolVersion'] as const;
const TEXT_FIELDS   = ['processStartStamp', 'bootIdentity', 'url', 'tokenFile', 'codeVersion'] as const;

function holderNamedIn(text: string): HephaestusLockHolder | null {
  const parsedJson = StoredValueUtil.parsedJsonOf(text);
  if (parsedJson.verdict === 'unparseable' || !JsonRecordUtil.valueIsAPlainObject(parsedJson.value)) return null;
  const {
    processId, processStartStamp, bootIdentity, url, tokenFile
  } = parsedJson.value;
  if (typeof processId !== 'number' || typeof processStartStamp !== 'string' || typeof bootIdentity !== 'string' || typeof url !== 'string') return null;
  return {
    processId, processStartStamp, bootIdentity, url, tokenFile: typeof tokenFile === 'string' ? tokenFile : null
  };
}

function recordOf(document: Readonly<Record<string, unknown>>): { verdict: 'readable'; record: HephaestusLockFileRecord } | { verdict: 'unreadable'; reason: string } {
  const wrongNumber = NUMBER_FIELDS.find((field) => typeof document[field] !== 'number');
  if (wrongNumber !== undefined) return { verdict: 'unreadable', reason: `its "${wrongNumber}" is not a number` };
  const wrongText = TEXT_FIELDS.find((field) => typeof document[field] !== 'string');
  if (wrongText !== undefined) return { verdict: 'unreadable', reason: `its "${wrongText}" is not a string` };
  return {
    verdict: 'readable',
    record:  {
      processId:            document['processId'] as number,
      processStartStamp:    document['processStartStamp'] as string,
      bootIdentity:         document['bootIdentity'] as string,
      port:                 document['port'] as number,
      url:                  document['url'] as string,
      tokenFile:            document['tokenFile'] as string,
      codeVersion:          document['codeVersion'] as string,
      installVersion:       document['installVersion'] as number,
      talosProtocolVersion: document['talosProtocolVersion'] as number,
    },
  };
}

export class HephaestusLockIngestion {
  constructor(private readonly hephaestusLockFilePath: string) {}

  /** Never throws. */
  read(): HephaestusLockFileReading {
    const storedText = storedFileTextOf(this.hephaestusLockFilePath);
    if (storedText.verdict === 'absent') return storedText;
    if (storedText.verdict === 'unreadable') return { ...storedText, namedHolder: null };
    const stored = StoredJsonDocumentUtil.documentOfText(storedText.text, HEPHAESTUS_LOCK_FORMAT_VERSION);
    const reading = stored.verdict === 'readable' ? recordOf(stored.document) : stored;
    if (reading.verdict === 'readable') return reading;
    return { ...reading, namedHolder: holderNamedIn(storedText.text) };
  }
}
