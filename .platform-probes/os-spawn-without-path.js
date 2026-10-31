// What Bun.spawn does with an environment lacking PATH: a bare program name, then an absolute one.
import { probe } from './support/probe.js';
import { programPathOf, runProgram } from './support/programs.js';

await probe({
  unknown: 'spawn-without-path',
  observe: async () => {
    const gitPath = programPathOf('git');
    return {
      gitPathFromThisProcess: gitPath,
      bareNameUnderEmptyEnvironment: await runProgram(['git', '--version'], { env: {} }),
      absolutePathUnderEmptyEnvironment: gitPath === null ? null : await runProgram([gitPath, '--version'], { env: {} }),
      bunUnderEmptyEnvironment: await runProgram([process.execPath, '--version'], { env: {} }),
    };
  },
});
