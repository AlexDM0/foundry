// bwrap on this kernel: a plain run, with a user namespace, and with `--disable-userns`. Run it once as the machine
// comes and once with `kernel.apparmor_restrict_unprivileged_userns=0`; the sysctl's value is in the line.
import { readFileSync } from 'node:fs';

import { probe } from './support/probe.js';
import { attempt, programPathOf, runProgram } from './support/programs.js';

const BIND_ROOT = ['--ro-bind', '/', '/', '--dev', '/dev', '--proc', '/proc'];

await probe({
  unknown: 'bwrap-user-namespaces',
  appliesTo: ['linux'],
  observe: async () => {
    const bwrapPath = programPathOf('bwrap');
    const base = {
      bwrapPath,
      osRelease: await attempt(() => readFileSync('/etc/os-release', 'utf8')),
      apparmorRestrictUnprivilegedUserNamespaces: await attempt(() => readFileSync('/proc/sys/kernel/apparmor_restrict_unprivileged_userns', 'utf8').trim()),
      unprivilegedUserNamespaceClone: await attempt(() => readFileSync('/proc/sys/kernel/unprivileged_userns_clone', 'utf8').trim()),
    };
    if (bwrapPath === null) return base;
    return {
      ...base,
      version: await runProgram([bwrapPath, '--version']),
      plain: await runProgram([bwrapPath, ...BIND_ROOT, '/bin/true']),
      unshareUser: await runProgram([bwrapPath, '--unshare-user', ...BIND_ROOT, '/bin/true']),
      disableUserNamespaces: await runProgram([bwrapPath, '--unshare-user', '--disable-userns', ...BIND_ROOT, '/bin/true']),
    };
  },
});
