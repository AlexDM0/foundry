// What creating a symlink raises, as a file, a folder and a junction. Answers differ for a standard user.
import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { probe } from './support/probe.js';
import { attempt, elevationOf } from './support/programs.js';
import { scratchFolder } from './support/scratch.js';

await probe({
  unknown: 'symlink-permission',
  observe: async () => {
    const folder = scratchFolder();
    const targetFile = join(folder, 'target.txt');
    const targetFolder = join(folder, 'target-folder');
    writeFileSync(targetFile, 'target\n');
    mkdirSync(targetFolder);
    return {
      elevation: await elevationOf(),
      fileLink: await attempt(() => symlinkSync(targetFile, join(folder, 'file-link'), 'file')),
      folderLink: await attempt(() => symlinkSync(targetFolder, join(folder, 'folder-link'), 'dir')),
      junction: await attempt(() => symlinkSync(targetFolder, join(folder, 'junction-link'), 'junction')),
    };
  },
});
