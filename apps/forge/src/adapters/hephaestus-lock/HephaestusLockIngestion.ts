/**
 * `<data>/hephaestus/lock-<generation>.json`, the record of the Hephaestus that holds a board: read, validate, map. It is a holding judged by
 * its process, so a record of today's fields reads whatever its version, as the lock of a Hephaestus of older code does.
 */
import { StoredJsonDocumentUtil }     from '../utils/StoredJsonDocumentUtil.ts';
import type { HephaestusLockProblem } from './@types/HephaestusLockProblem.ts';

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

export type HephaestusLockFileReading =
  | { verdict: 'readable'; record: HephaestusLockFileRecord }
  | { verdict: 'absent' }
  | { verdict: 'unreadable'; problem: HephaestusLockProblem };

export const HEPHAESTUS_LOCK_FORMAT_VERSION = 1;

const NUMBER_FIELDS = ['processId', 'port', 'installVersion', 'talosProtocolVersion'] as const;
const TEXT_FIELDS   = ['processStartStamp', 'bootIdentity', 'url', 'tokenFile', 'codeVersion'] as const;

export class HephaestusLockIngestion {
  constructor(private readonly hephaestusLockFilePath: string) {}

  /** Never throws. */
  read(): HephaestusLockFileReading {
    const stored = StoredJsonDocumentUtil.holdingDocumentAt(this.hephaestusLockFilePath);
    if (stored.verdict !== 'readable') return stored;
    const { document } = stored;
    const wrongNumber = NUMBER_FIELDS.find((field) => typeof document[field] !== 'number');
    if (wrongNumber !== undefined) return { verdict: 'unreadable', problem: { code: 'field-not-a-number', field: wrongNumber } };
    const wrongText = TEXT_FIELDS.find((field) => typeof document[field] !== 'string');
    if (wrongText !== undefined) return { verdict: 'unreadable', problem: { code: 'field-not-a-string', field: wrongText } };
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
}
