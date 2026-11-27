import type { InstallManifestProblem }  from '../../shared/@types/InstallManifestProblem.ts';
import { StoredFileProblemWordingUtil } from '../utils/StoredFileProblemWordingUtil.ts';

function sentenceOf(problem: InstallManifestProblem): string {
  switch (problem.code) {
    case 'install-version-not-a-whole-number':
      return `installVersion is ${problem.storedValue ?? 'missing'}, and it has to be a whole number of at least ${problem.lowestInstallVersion}`;
    default:
      return StoredFileProblemWordingUtil.sentenceOf(problem);
  }
}

export const InstallManifestProblemWording = Object.freeze({ sentenceOf });
