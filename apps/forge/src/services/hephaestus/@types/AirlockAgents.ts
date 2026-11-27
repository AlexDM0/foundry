import type { JobRole }   from '../../../domain/tracker-model/@types/Job.ts';
import type { EntityKey } from '../../../domain/tracker-model/@types/Pipeline.ts';

/** Who an Airlock agent is: its role, and on a pipeline with entities the entity and stage it runs, which its session and sandbox follow. */
export interface AirlockAgentScope {
  role:    JobRole;
  entity?: EntityKey;
  stage?:  number;
}

export type EntityAndStage = Readonly<{ entity?: EntityKey; stage?: number }>;

/** The Airlock agents launched under one merge job, in launch order, and the newest one's ending. */
export interface AirlockAgentHistory {
  /**
   * The conflict or red handoff launches and the red resumes; a fresh agent in place of one that could not resume adds none, and neither
   * does a conflict re-reviewer, a fresh session of its own, or a package's builder with no session of that package's build to resume.
   */
  resumes:       number;
  freshAgentIds: ReadonlySet<string>;
  newestEnding:  ({ jobId: string; outcome: string; attempt: number; role: JobRole | null } & EntityAndStage) | null;
}
