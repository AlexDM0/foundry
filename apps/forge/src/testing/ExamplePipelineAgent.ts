/** The agent a spec's setup record or pipeline names, following the machine's program of an example vendor. */
import type { PipelineAgent } from '../lib/tracker-model/@types/Pipeline.ts';

export const EXAMPLE_PIPELINE_AGENT: Readonly<PipelineAgent> = Object.freeze({ vendor: 'example-agent', program: Object.freeze({ follows: 'machine' }) });
