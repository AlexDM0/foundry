// What a parent reads for a real exit of 256 and of -1, and for a crash.
import { probe } from './support/probe.js';
import { runProgram } from './support/programs.js';

const bunExitOf = (source) => runProgram([process.execPath, '-e', source]);

const shellExitOf = (code) => (process.platform === 'win32'
  ? runProgram(['cmd.exe', '/d', '/c', `exit ${code}`])
  : runProgram(['/bin/sh', '-c', `exit ${code}`]));

await probe({
  unknown: 'exit-code-extremes',
  observe: async () => ({
    bunExit256: await bunExitOf('process.exit(256)'),
    bunExitMinusOne: await bunExitOf('process.exit(-1)'),
    bunAbort: await bunExitOf('process.abort()'),
    bunSegmentationFaultSignal: await bunExitOf(`process.kill(process.pid, 'SIGSEGV')`),
    shellExit256: await shellExitOf(256),
    shellExitMinusOne: await shellExitOf(-1),
  }),
});
