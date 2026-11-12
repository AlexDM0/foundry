import type { PipelineReading } from '../../adapters/pipeline/PipelineFile.ts';
import { TRACKER_FILES }        from '../tracker/constants/TrackerFiles.ts';
import type { MergedTreeGate }  from './Airlocks.ts';

/**
 * A merged-tree gate run on an older or malformed `pipeline.json` cannot read its gates, so it ends `cannot-run`, as the Board holds for
 * such a file, and the merge waits on the incident; `null` when the run reads a pipeline, or none at all.
 */
export function unreadablePipelineGateOf(reading: PipelineReading): MergedTreeGate | null {
  if (reading.verdict !== 'older' && reading.verdict !== 'malformed') return null;
  return {
    outcome: 'cannot-run', step: TRACKER_FILES.PIPELINE_FILE_NAME, output: reading.verdict === 'malformed' ? reading.reason : reading.verdict, stamp: null
  };
}
