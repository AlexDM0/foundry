// A fast-forward over a tracked file another process holds: git's exit and words, and where HEAD and the file end up.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { probe } from './support/probe.js';
import { attempt, holdFileOnWindows } from './support/programs.js';
import { createRepository, git, scratchFolder } from './support/scratch.js';

async function fastForwardOverFileHeldWith(fileShare) {
  const repository = await createRepository(join(scratchFolder(), 'repo'));
  const trackedPath = join(repository, 'file.txt');
  await git(repository, 'switch', '-c', 'ahead');
  writeFileSync(trackedPath, 'second\n');
  await git(repository, 'commit', '-am', 'Change the file');
  await git(repository, 'switch', 'main');
  const release = await holdFileOnWindows(trackedPath, fileShare);
  const merge = await git(repository, 'merge', '--ff-only', 'ahead');
  const statusWhileHeld = await git(repository, 'status', '--porcelain', '--branch');
  await release();
  return {
    merge,
    statusWhileHeld,
    head: (await git(repository, 'rev-parse', 'HEAD')).stdout,
    aheadTip: (await git(repository, 'rev-parse', 'ahead')).stdout,
    fileAfterRelease: await attempt(() => readFileSync(trackedPath, 'utf8')),
  };
}

await probe({
  unknown: 'fast-forward-held-file',
  appliesTo: ['win32'],
  observe: async () => ({
    fileShareRead: await fastForwardOverFileHeldWith('Read'),
    fileShareReadWriteDelete: await fastForwardOverFileHeldWith('ReadWrite, Delete'),
  }),
});
