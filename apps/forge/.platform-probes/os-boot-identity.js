// The BootId registry value beside the boot time and the Fast Startup switch. Compare two runs, one on each side of a
// shutdown with Fast Startup on, to see whether BootId moved.
import { probe } from './support/probe.js';
import { runPowershell, runProgram } from './support/programs.js';

await probe({
  unknown: 'boot-identity',
  appliesTo: ['win32'],
  observe: async () => ({
    bootId: await runProgram(['reg', 'query', 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management\\PrefetchParameters', '/v', 'BootId']),
    fastStartup: await runProgram(['reg', 'query', 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Power', '/v', 'HiberbootEnabled']),
    lastBootUpTime: await runPowershell('(Get-CimInstance Win32_OperatingSystem).LastBootUpTime.ToString("o")'),
  }),
});
