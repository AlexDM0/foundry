/** `hephaestus/heartbeat.json`, the newest beat of a generation: read, validate every field, map. */
import { StoredJsonDocumentUtil }   from '../utils/StoredJsonDocumentUtil.ts';
import { StoredValueUtil }          from '../utils/StoredValueUtil.ts';
import type { HeartbeatRecord }     from './@types/HeartbeatRecord.ts';
import { HEARTBEAT_FORMAT_VERSION } from './constants/HeartbeatFileVersions.ts';

export type HeartbeatReading =
  | { verdict: 'readable'; record: HeartbeatRecord }
  | { verdict: 'absent' }
  | { verdict: 'unreadable'; reason: string };

const HEARTBEAT_VERSION_KEY = 'heartbeatVersion';

export class HeartbeatIngestion {
  constructor(private readonly heartbeatFilePath: string) {}

  /** Never throws: a beat of another `heartbeatVersion` is unreadable, as nothing older is read. */
  read(): HeartbeatReading {
    const stored = StoredJsonDocumentUtil.documentAt(this.heartbeatFilePath, HEARTBEAT_FORMAT_VERSION, HEARTBEAT_VERSION_KEY);
    if (stored.verdict !== 'readable') return stored;
    const { generation, sequence, at } = stored.document;
    if (!StoredValueUtil.wholeNumberIsAtLeast(generation, 1)) return { verdict: 'unreadable', reason: 'generation is not a whole number from 1' };
    if (!StoredValueUtil.wholeNumberIsAtLeast(sequence, 1)) return { verdict: 'unreadable', reason: 'sequence is not a whole number from 1' };
    if (typeof at !== 'string') return { verdict: 'unreadable', reason: 'at is not a string' };
    return {
      verdict: 'readable',
      record:  {
        heartbeatVersion: HEARTBEAT_FORMAT_VERSION, generation, sequence, at
      },
    };
  }
}
