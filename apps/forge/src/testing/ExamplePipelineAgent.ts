/** The agent a spec's setup record or pipeline names, following the machine's program of an example vendor, and the ways vendors bill. */
import type { PipelineAgent }         from '../domain/tracker-model/@types/Pipeline.ts';
import type { OfferedBillingModesOf } from '../domain/tracker-model/@types/PipelineSetup.ts';

export const EXAMPLE_PIPELINE_AGENT: Readonly<PipelineAgent> = Object.freeze({ vendor: 'example-agent', program: Object.freeze({ follows: 'machine' }) });

/** Every vendor bills by its login, its default, or by an API key. */
export const EVERY_BILLING_MODE_OFFERED: OfferedBillingModesOf = () => ['subscription', 'api'];
