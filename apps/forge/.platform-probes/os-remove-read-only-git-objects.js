// Whether rmSync recursive and forced removes a repository, whose git objects are read-only.
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { probe } from './support/probe.js';
import { attempt } from './support/programs.js';
import { createRepository, scratchFolder } from './support/scratch.js';

function firstObjectFileIn(repository) {
  const objectsFolder = join(repository, '.git', 'objects');
  const fanOutFolder = readdirSync(objectsFolder).find((name) => name.length === 2);
  return join(objectsFolder, fanOutFolder, readdirSync(join(objectsFolder, fanOutFolder))[0]);
}

await probe({
  unknown: 'remove-read-only-git-objects',
  observe: async () => {
    const repository = await createRepository(join(scratchFolder(), 'repo'));
    const objectFileMode = statSync(firstObjectFileIn(repository)).mode.toString(8);
    return {
      objectFileMode,
      removal: await attempt(() => rmSync(repository, { recursive: true, force: true })),
      repositoryExistsAfter: existsSync(repository),
    };
  },
});
