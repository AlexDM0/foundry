import type { GatePhase }                                from '../../../domain/tracker-model/@types/GatePhase.ts';
import type { BaseStoredFileProblem, StoredFileProblem } from '../../../shared/@types/StoredFileProblem.ts';
import type { JobFileFieldProblem }                      from '../../@types/JobFileFieldProblem.ts';

/** Why a gate run's manifest could not be read for the phase its file name stands for. */
export type GateRunManifestProblem =
  | BaseStoredFileProblem
  | JobFileFieldProblem
  | StoredFileProblem<'not-the-phase'> & { readonly field: 'phase'; readonly expectedPhase: GatePhase };
