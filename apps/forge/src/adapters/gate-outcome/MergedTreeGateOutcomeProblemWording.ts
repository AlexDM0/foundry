import { StoredFileProblemWording }          from '../StoredFileProblemWording.ts';
import type { MergedTreeGateOutcomeProblem } from './@types/MergedTreeGateOutcomeProblem.ts';

function sentenceOf(problem: MergedTreeGateOutcomeProblem): string {
  switch (problem.code) {
    case 'gate-not-an-object':           return `its "${problem.field}" is not an object`;
    case 'not-a-gate-outcome':           return `"${problem.field}" is no gate outcome`;
    case 'neither-null-nor-a-step-name': return `"${problem.field}" is neither null nor a step name`;
    case 'not-an-entity-key':            return `"${problem.field}" is not an entity key`;
    case 'output-not-text':              return `"${problem.field}" is not text`;
    case 'neither-null-nor-a-stamp':     return `"${problem.field}" is neither null nor a phase with its hash`;
    case 'not-a-hash-by-entity':         return `"${problem.field}" is not a hash by entity`;
    case 'not-cache-reports':            return `"${problem.field}" is not the cache reports of a gate run`;
    case 'not-step-runs':                return `"${problem.field}" is not the step lines of a gate run`;
    default:                             return StoredFileProblemWording.sentenceOf(problem);
  }
}

export const MergedTreeGateOutcomeProblemWording = Object.freeze({ sentenceOf });
