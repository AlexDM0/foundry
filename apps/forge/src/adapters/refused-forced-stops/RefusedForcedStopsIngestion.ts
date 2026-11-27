/** `child-<instance>.refused-forced-stops` beside a lost child's record: read, validate every field, map. */
import { StoredJsonDocumentUtil }              from '../utils/StoredJsonDocumentUtil.ts';
import { StoredValueUtil }                     from '../utils/StoredValueUtil.ts';
import type { ForcedStopRefusals }             from './@types/ForcedStopRefusals.ts';
import type { RefusedForcedStopsProblem }      from './@types/RefusedForcedStopsProblem.ts';
import { REFUSED_FORCED_STOPS_FORMAT_VERSION } from './constants/RefusedForcedStopsFileVersions.ts';

export type RefusedForcedStopsReading =
  | { verdict: 'readable'; forcedStopRefusals: ForcedStopRefusals }
  | { verdict: 'absent' }
  | { verdict: 'unreadable'; problem: RefusedForcedStopsProblem };

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
    if (!StoredValueUtil.wholeNumberIsAtLeast(refusals, 1)) return { verdict: 'unreadable', problem: { code: 'refused-forced-stops-field-malformed', field: 'refusals' } };
    if (!Array.isArray(treeProcessIds) || !treeProcessIds.every(isProcessId)) {
      return { verdict: 'unreadable', problem: { code: 'refused-forced-stops-field-malformed', field: 'treeProcessIds' } };
    }
    return { verdict: 'readable', forcedStopRefusals: { refusals, treeProcessIds: [...treeProcessIds] } };
  }
}
