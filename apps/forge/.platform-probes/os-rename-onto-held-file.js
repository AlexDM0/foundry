// renameSync onto a target another process holds, with and without FILE_SHARE_DELETE. PowerShell holds the file, since
// libuv opens every file with FILE_SHARE_DELETE itself.
import { readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { probe } from './support/probe.js';
import { attempt, holdFileOnWindows } from './support/programs.js';
import { scratchFolder } from './support/scratch.js';

async function renameOntoFileHeldWith(fileShare) {
  const folder = scratchFolder();
  const targetPath = join(folder, 'target.txt');
  const sourcePath = join(folder, 'source.txt');
  writeFileSync(targetPath, 'target\n');
  writeFileSync(sourcePath, 'source\n');
  const release = await holdFileOnWindows(targetPath, fileShare);
  const rename = await attempt(() => renameSync(sourcePath, targetPath));
  const unlink = await attempt(() => unlinkSync(targetPath));
  await release();
  return { rename, unlink, targetAfterRelease: await attempt(() => readFileSync(targetPath, 'utf8')) };
}

await probe({
  unknown: 'rename-onto-held-file',
  appliesTo: ['win32'],
  observe: async () => ({
    fileShareRead: await renameOntoFileHeldWith('Read'),
    fileShareReadWrite: await renameOntoFileHeldWith('ReadWrite'),
    fileShareReadWriteDelete: await renameOntoFileHeldWith('ReadWrite, Delete'),
  }),
});
