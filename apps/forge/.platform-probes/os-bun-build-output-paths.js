// The paths Bun.build reports for its outputs, by absolute and relative outdir.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { probe } from './support/probe.js';
import { attempt } from './support/programs.js';
import { scratchFolder } from './support/scratch.js';

const outputPathsOf = (buildRequest) => attempt(async () => (await Bun.build(buildRequest)).outputs.map((output) => output.path));

await probe({
  unknown: 'bun-build-output-paths',
  observe: async () => {
    const folder = scratchFolder();
    mkdirSync(join(folder, 'source'));
    const entryPath = join(folder, 'source', 'entry.js');
    writeFileSync(entryPath, 'console.log("entry");\n');
    process.chdir(folder);
    return {
      entryPath,
      toAbsoluteOutdir: await outputPathsOf({ entrypoints: [entryPath], outdir: join(folder, 'absolute-output') }),
      toRelativeOutdir: await outputPathsOf({ entrypoints: [entryPath], outdir: 'relative-output', root: folder }),
      toMemory: await outputPathsOf({ entrypoints: [entryPath] }),
    };
  },
});
