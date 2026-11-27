import type { PipelineProblem }       from '../../lib/tracker-model/@types/PipelineProblem.ts';
import { EntityRefusalWording }       from './EntityRefusalWording.ts';
import { StoredRecordProblemWording } from './StoredRecordProblemWording.ts';

const TOP_LEVEL_GATES = 'gates';

function sentenceOf(problem: PipelineProblem): string {
  switch (problem.code) {
    case 'unknown-pipeline-key':
      return `${problem.field === undefined ? '' : `${problem.field}.`}${JSON.stringify(problem.key)} is not a pipeline key; the keys are ${problem.knownKeys.join(', ')}`;
    case 'not-a-list-of-non-blank-texts':      return `${problem.field} is not a list of non-blank texts`;
    case 'present-and-not-a-non-blank-text':   return `${problem.field} is present and is not a non-blank text`;
    case 'has-no-name':                        return `${problem.field} has no name`;
    case 'not-a-non-blank-text':               return `${problem.field} is not a non-blank text`;
    case 'not-a-path-inside-the-repository':   return `${problem.field} is not a path inside the repository`;
    case 'not-a-folder-inside-the-repository': return `${problem.field} is not a folder inside the repository`;
    case 'has-no-run-line':                    return `${problem.field} has no run line`;
    case 'present-and-not-true':               return `${problem.field} is present and is not true`;
    case 'holds-a-relative-folder':            return `${problem.field} holds a folder that is not absolute or ~/`;
    case 'not-a-list-of-gate-names':           return `${problem.field} is not a list of gate names`;
    case 'not-a-known-model':                  return `${problem.field} is not a known model`;
    case 'not-a-known-effort':                 return `${problem.field} is not a known effort`;
    case 'budget-with-subscription':           return `${problem.field} is present with mode subscription`;
    case 'not-a-billing-mode':                 return `${problem.field} is neither subscription nor api`;
    case 'not-a-positive-number':              return `${problem.field} is not a positive number`;
    case 'not-an-absolute-path':               return `${problem.field} is not an absolute path`;
    case 'not-a-name':                         return `${problem.field} is not a name`;
    case 'not-machine':                        return `${problem.field} is not machine`;
    case 'neither-follows-nor-pinned':         return `${problem.field} names neither follows nor pinned alone`;
    case 'not-a-positive-whole-number':        return `${problem.field} is not a positive whole number`;
    case 'names-no-folder':                    return `${problem.field} names no folder`;
    case 'holds-a-blank-key':                  return `${problem.field} holds a blank key`;
    case 'not-empty-beside-entities':          return `${problem.field} is not empty beside entities; each entity holds its own`;
    case 'not-a-whole-number':                 return `${problem.field} is not a whole number`;
    case 'not-a-repository-path':
      return `${problem.field} names ${JSON.stringify(problem.path)}, which is not a repository path leading with /`;
    case 'names-no-gate':                      return `${problem.field} names ${JSON.stringify(problem.name)}, which is not a gate`;
    case 'gate-runs-in-no-phase':
      return `the gate ${JSON.stringify(problem.gateName)}${problem.field === TOP_LEVEL_GATES ? '' : ` of ${problem.field}`} runs in no phase`;
    case 'not-one-of':                         return `${problem.field} is not one of ${problem.choices.join(', ')}`;
    case 'always-read-document':
      return `${problem.field} is ${problem.rule}; the ${problem.role} always reads the ${problem.document}`;
    case 'lists-twice':                        return `${problem.field} lists ${JSON.stringify(problem.entry)} twice`;
    case 'step-and-gate-share-a-name':         return `${JSON.stringify(problem.name)} names both a prepare step and a gate`;
    case 'entities-refused':                   return EntityRefusalWording.reasonOf(problem.refusal);
    case 'newer-format':
      return `${problem.field} is ${problem.storedVersion}, a newer format than version ${problem.readVersion}, which this build reads (newer-format)`;
    case 'entities-in-a-folder':
      return `it holds entities, and only a tracker at the repository's root may hold them, not one in the folder ${problem.projectPrefix} (entities-in-a-folder)`;
    default:                                   return StoredRecordProblemWording.sentenceOf(problem);
  }
}

export const PipelineProblemWording = Object.freeze({ sentenceOf });
