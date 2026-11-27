import { StoredFileProblemWordingUtil } from '../utils/StoredFileProblemWordingUtil.ts';
import type { LaunchSettingsProblem }   from './@types/LaunchSettingsProblem.ts';

function sentenceOf(problem: LaunchSettingsProblem): string {
  switch (problem.code) {
    case 'launch-setting-not-text': return `its "${problem.field}" is not text`;
    default:                        return StoredFileProblemWordingUtil.sentenceOf(problem);
  }
}

export const LaunchSettingsProblemWording = Object.freeze({ sentenceOf });
