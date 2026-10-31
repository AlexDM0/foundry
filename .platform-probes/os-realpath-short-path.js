// What realpathSync returns for an 8.3 path, as the temp folder of a long user name gives one.
import { mkdirSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { probe } from './support/probe.js';
import { attempt, runProgram } from './support/programs.js';
import { scratchFolder } from './support/scratch.js';

await probe({
  unknown: 'realpath-short-path',
  appliesTo: ['win32'],
  observe: async () => {
    const longFolder = join(scratchFolder(), 'a-folder-with-a-long-probe-name');
    mkdirSync(longFolder);
    const shortForm = await runProgram(['cmd.exe', '/d', '/c', `for %I in ("${longFolder}") do @echo %~sI`]);
    const shortPath = (shortForm.stdout ?? '').trim();
    return {
      tmpdir: tmpdir(),
      longFolder,
      shortForm,
      realpathSync: await attempt(() => realpathSync(shortPath)),
      realpathSyncNative: await attempt(() => realpathSync.native(shortPath)),
      realpathOfTmpdir: await attempt(() => realpathSync(tmpdir())),
      eightDotThreeState: await runProgram(['fsutil', '8dot3name', 'query', longFolder.slice(0, 2)]),
    };
  },
});
