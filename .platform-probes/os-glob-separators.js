// Which separators Bun.Glob scans return, and which a match accepts.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { probe } from './support/probe.js';
import { attempt } from './support/programs.js';
import { scratchFolder } from './support/scratch.js';

await probe({
  unknown: 'glob-separators',
  observe: async () => {
    const folder = scratchFolder();
    mkdirSync(join(folder, 'nested', 'deeper'), { recursive: true });
    writeFileSync(join(folder, 'nested', 'deeper', 'leaf.txt'), 'leaf\n');
    return {
      pathSeparator: join('a', 'b').charAt(1),
      scanned: [...new Bun.Glob('**/*.txt').scanSync({ cwd: folder })],
      scannedAbsolute: [...new Bun.Glob('**/*.txt').scanSync({ cwd: folder, absolute: true })],
      forwardPatternMatchesForwardPath: await attempt(() => new Bun.Glob('nested/**/*.txt').match('nested/deeper/leaf.txt')),
      forwardPatternMatchesBackwardPath: await attempt(() => new Bun.Glob('nested/**/*.txt').match('nested\\deeper\\leaf.txt')),
    };
  },
});
