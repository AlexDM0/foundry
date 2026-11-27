/**
 * The gate record of a merged-tree run on a `pipeline.json` it cannot read: the record's `output` is stored text, so the pipeline's problem is
 * worded here, where the record is built, and no service words it.
 */
import type { PipelineReading }   from '../pipeline/PipelineFile.ts';
import { PipelineProblemWording } from '../pipeline/PipelineProblemWording.ts';
import type { MergedTreeGate }    from './@types/MergedTreeGate.ts';

/** The gate step a merge records when the stored pipeline cannot be read; it names the record, never where it is kept. */
export const UNREADABLE_PIPELINE_STEP = 'stored-pipeline';

/**
 * A merged-tree gate run on an older or malformed `pipeline.json` cannot read its gates, so it ends `cannot-run`, as the Board holds for
 * such a file, and the merge waits on the incident; `null` when the run reads a pipeline, or none at all.
 */
export function unreadablePipelineGateOf(reading: PipelineReading): MergedTreeGate | null {
  if (reading.verdict !== 'older' && reading.verdict !== 'malformed') return null;
  const output = reading.verdict === 'malformed' ? PipelineProblemWording.sentenceOf(reading.problem) : reading.verdict;
  return {
    outcome: 'cannot-run', step: UNREADABLE_PIPELINE_STEP, output, stamp: null
  };
}
