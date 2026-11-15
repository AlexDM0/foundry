// Whether a SIGKILLed bwrap leaves an empty read-only file where it made a mount point inside a writable bind.
import { existsSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { probe } from './support/probe.js';
import { killQuietly, programPathOf, sleepMilliseconds } from './support/programs.js';
import { scratchFolder } from './support/scratch.js';

const SANDBOX_START_MILLISECONDS = 1000;

await probe({
  unknown: 'mount-point-residue',
  appliesTo: ['linux'],
  observe: async () => {
    const bwrapPath = programPathOf('bwrap');
    if (bwrapPath === null) return { bwrapPath };
    const folder = scratchFolder();
    const sourcePath = join(folder, 'source.txt');
    const writableFolder = join(folder, 'writable');
    const mountPoint = join(writableFolder, 'mount-point.txt');
    await Bun.$`mkdir -p ${writableFolder}`;
    writeFileSync(sourcePath, 'source\n');
    const sandbox = Bun.spawn(
      [bwrapPath, '--ro-bind', '/', '/', '--bind', writableFolder, writableFolder, '--ro-bind', sourcePath, mountPoint, 'sleep', '30'],
      { stdin: 'ignore', stdout: 'ignore', stderr: 'pipe' },
    );
    await sleepMilliseconds(SANDBOX_START_MILLISECONDS);
    killQuietly(sandbox.pid);
    await sandbox.exited;
    const mountPointExists = existsSync(mountPoint);
    const residue = mountPointExists ? statSync(mountPoint) : null;
    return {
      bwrapPath,
      sandboxExitCode: sandbox.exitCode,
      sandboxSignalCode: sandbox.signalCode ?? null,
      sandboxStderr: await new Response(sandbox.stderr).text(),
      mountPointExists,
      residueSizeBytes: residue?.size ?? null,
      residueMode: residue?.mode.toString(8) ?? null,
    };
  },
});
