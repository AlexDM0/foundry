/** `child-<instance>.refused-forced-stops` beside a lost child's record: read, validate every field, map. */
import { StoredJsonDocumentUtil }              from '../utils/StoredJsonDocumentUtil.ts';
import { StoredValueUtil }                     from '../utils/StoredValueUtil.ts';
import type { ForcedStopRefusals }             from './@types/ForcedStopRefusals.ts';
import { REFUSED_FORCED_STOPS_FORMAT_VERSION } from './constants/RefusedForcedStopsFileVersions.ts';

export type RefusedForcedStopsReading =
  | { verdict: 'readable'; forcedStopRefusals: ForcedStopRefusals }
  | { verdict: 'absent' }
  | { verdict: 'unreadable'; reason: string };

function isProcessId(value: unknown): value is number {
  return StoredValueUtil.wholeNumberIsAtLeast(value, 1);
}

export class RefusedForcedStopsIngestion {
  constructor(private readonly refusedForcedStopsFilePath: string) {}

  /** Never throws; a child whose stop was never refused has no file, which is `absent`. */
  read(): RefusedForcedStopsReading {
    const stored = StoredJsonDocumentUtil.documentAt(this.refusedForcedStopsFilePath, REFUSED_FORCED_STOPS_FORMAT_VERSION);
    if (stored.verdict !== 'readable') return stored;
    const { refusals, treeProcessIds } = stored.document;
    if (!StoredValueUtil.wholeNumberIsAtLeast(refusals, 1)) return { verdict: 'unreadable', reason: 'refusals is not a whole number from 1' };
    if (!Array.isArray(treeProcessIds) || !treeProcessIds.every(isProcessId)) return { verdict: 'unreadable', reason: 'treeProcessIds is not a list of process ids' };
    return { verdict: 'readable', forcedStopRefusals: { refusals, treeProcessIds: [...treeProcessIds] } };
  }
}
