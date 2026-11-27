import type { MergedTreeGate }    from '../../adapters/gate-outcome/@types/MergedTreeGate.ts';
import type { PipelineReading }   from '../../adapters/pipeline/PipelineFile.ts';
import { PipelineProblemWording } from '../../adapters/pipeline/PipelineProblemWording.ts';

/** The gate step a merge records when the stored pipeline cannot be read; it names the record, never where it is kept. */
export const UNREADABLE_PIPELINE_STEP = 'stored-pipeline';

/**
 * A merged-tree gate run on an older or malformed `pipeline.json` cannot read its gates, so it ends `cannot-run`, as the Board holds for
 * such a file, and the merge waits on the incident; `null` when the run reads a pipeline, or none at all.
 */
export function unreadablePipelineGateOf(reading: PipelineReading): MergedTreeGate | null {
  if (reading.verdict !== 'older' && reading.verdict !== 'malformed') return null;
  // The gate's output is stored text; a bridge until the gate record carries the problem.
  const output = reading.verdict === 'malformed' ? PipelineProblemWording.sentenceOf(reading.problem) : reading.verdict;
  return {
    outcome: 'cannot-run', step: UNREADABLE_PIPELINE_STEP, output, stamp: null
  };
}
