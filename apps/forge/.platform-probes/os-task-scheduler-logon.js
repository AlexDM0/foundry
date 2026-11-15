// Whether this account may create an at-logon task, the answer differing for a standard user. The task is deleted again.
import { probe } from './support/probe.js';
import { elevationOf, runProgram } from './support/programs.js';

await probe({
  unknown: 'task-scheduler-logon',
  appliesTo: ['win32'],
  observe: async () => {
    const taskName = `platform-probe-${process.pid}`;
    const created = await runProgram(['schtasks', '/Create', '/SC', 'ONLOGON', '/TN', taskName, '/TR', 'cmd.exe /d /c exit 0', '/F']);
    const queried = await runProgram(['schtasks', '/Query', '/TN', taskName, '/FO', 'LIST']);
    const deleted = await runProgram(['schtasks', '/Delete', '/TN', taskName, '/F']);
    return { elevation: await elevationOf(), created, queried, deleted };
  },
});
