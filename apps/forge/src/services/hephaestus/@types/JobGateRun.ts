import type { JobStart }        from '../../../adapters/job-start/JobStartIngestion.ts';
import type { GatePhase }       from '../../../domain/tracker-model/@types/GatePhase.ts';
import type { EntityKey }       from '../../../domain/tracker-model/@types/Pipeline.ts';
import type { GateConfinement } from '../../lifecycle/GateRun.ts';

/** One line child of a job's gate run: one prepare step, or one gate. */
export interface GateStep {
  kind:        'prepare' | 'gate';
  name:        string;
  /** The step's own name in its pipeline and its entity there, as its `pipeline-step-ran` record keeps them. */
  stepName:    string;
  entity:      EntityKey | undefined;
  line:        string;
  folder:      string;
  in:          string | null;
  confinement: GateConfinement;
}

/** What a package build's gate run reads of its job's start: the entities whose gates it leaves out. */
export type PackageBuildStart = Pick<JobStart, 'homeEntity' | 'dependentsFixedInGroup'>;

/** Which gate run of a job: its own run in one child instance, or a review's catch-up run before its reviewer. */
export interface GateRunPlace {
  phase:         GatePhase;
  childInstance: number;
  folderPrefix:  string;
}
