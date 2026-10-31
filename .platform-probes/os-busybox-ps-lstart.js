// Whether BusyBox ps prints lstart, beside what the machine's own ps does with it.
import { probe } from './support/probe.js';
import { programPathOf, runProgram } from './support/programs.js';

await probe({
  unknown: 'busybox-ps-lstart',
  appliesTo: ['linux'],
  observe: async () => {
    const busyboxPath = programPathOf('busybox');
    return {
      busyboxPath,
      busyboxPsLstart: busyboxPath === null ? null : await runProgram([busyboxPath, 'ps', '-o', 'pid,lstart']),
      machinePsPath: programPathOf('ps'),
      machinePsLstart: await runProgram(['ps', '-o', 'lstart=', '-p', String(process.pid)]),
    };
  },
});
