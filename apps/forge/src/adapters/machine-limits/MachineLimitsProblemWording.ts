import { StoredFileProblemWordingUtil } from '../utils/StoredFileProblemWordingUtil.ts';
import type { MachineLimitsProblem }    from './@types/MachineLimitsProblem.ts';

function sentenceOf(problem: MachineLimitsProblem): string {
  switch (problem.code) {
    case 'version-not-a-whole-number': return 'its "version" is not a whole number';
    case 'version-older':              return `its "version" ${problem.version} is older than ${problem.readableVersion}`;
    case 'agent-limit-below-one':      return 'its "agentLimit" is not a whole number of at least 1';
    default:                           return StoredFileProblemWordingUtil.sentenceOf(problem);
  }
}

export const MachineLimitsProblemWording = Object.freeze({ sentenceOf });
