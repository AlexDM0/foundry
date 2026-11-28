import type { JobRole }   from '../../../domain/tracker-model/@types/Job.ts';
import type { EntityKey } from '../../../domain/tracker-model/@types/Pipeline.ts';

/** Who an Airlock agent is: its role, and on a pipeline with entities the entity and stage it runs, which its session and sandbox follow. */
export interface AirlockAgentScope {
  role:    JobRole;
  entity?: EntityKey;
  stage?:  number;
}

export type EntityAndStage = Readonly<{ entity?: EntityKey; stage?: number }>;
