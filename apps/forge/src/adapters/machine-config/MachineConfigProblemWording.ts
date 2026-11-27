import type { MachineConfigUnwritableProblem } from '../../shared/@types/MachineConfigProblem.ts';
import { StoredFileProblemWordingUtil }        from '../utils/StoredFileProblemWordingUtil.ts';

function sentenceOf(problem: MachineConfigUnwritableProblem): string {
  switch (problem.code) {
    case 'version-not-a-whole-number':  return 'its "version" is not a whole number';
    case 'version-older':               return `its "version" ${problem.version} is older than ${problem.readableVersion}`;
    case 'version-newer':               return `its version ${problem.version} is newer than this program reads`;
    case 'agents-not-an-object':        return 'its "agents" is not an object';
    case 'agent-names-no-program-path': return `its agent "${problem.vendor}" names no "programPath"`;
    default:                            return StoredFileProblemWordingUtil.sentenceOf(problem);
  }
}

export const MachineConfigProblemWording = Object.freeze({ sentenceOf });
