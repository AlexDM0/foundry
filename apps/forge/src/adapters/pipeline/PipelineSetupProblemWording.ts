import type { ConstitutionSourcesProblem, PipelineSetupProblem } from '../../domain/tracker-model/@types/PipelineSetupProblem.ts';
import { PipelineProblemWording }                                from './PipelineProblemWording.ts';

function sentenceOf(problem: PipelineSetupProblem): string {
  switch (problem.code) {
    case 'neither-null-nor-a-text': return `${problem.field} is neither null nor a text`;
    case 'not-a-list-of-texts':     return `${problem.field} is not a list of texts`;
    case 'not-a-draft-field':       return `${problem.field} is not a draft field`;
    case 'not-an-entity-key':       return `${problem.field} is not an entity key`;
    case 'has-an-empty-entity-key': return `${problem.field} has an empty entity key`;
    case 'not-a-setup-id':
      return `${problem.field} is ${JSON.stringify(problem.storedValue) ?? 'missing'}, and it has to be a setup id such as S1`;
    case 'draft-not-a-pipeline':
      return `${problem.field} is not a pipeline: ${problem.draftProblem === null ? 'its version is older' : PipelineProblemWording.sentenceOf(problem.draftProblem)}`;
    default:                        return PipelineProblemWording.sentenceOf(problem);
  }
}

/** `constitution-sources.json` reads its annotations as the setup record does, so their problems are worded the same. */
function constitutionSourcesSentenceOf(problem: ConstitutionSourcesProblem): string {
  return problem.code === 'not-a-blob-id' ? `${problem.field} is not a blob id` : sentenceOf(problem);
}

export const PipelineSetupProblemWording = Object.freeze({ sentenceOf, constitutionSourcesSentenceOf });
