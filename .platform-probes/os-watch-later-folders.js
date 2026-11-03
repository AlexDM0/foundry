// Whether a recursive fs.watch sees a file in a folder created after the watch began.
import { mkdirSync, watch, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { probe, settleBoundedMilliseconds } from './support/probe.js';
import { sleepMilliseconds } from './support/programs.js';
import { scratchFolder } from './support/scratch.js';

const WATCH_SETTLE_MILLISECONDS = settleBoundedMilliseconds(500);

await probe({
  unknown: 'watch-later-folders',
  observe: async () => {
    const folder = scratchFolder();
    const events = [];
    const watcher = watch(folder, { recursive: true }, (eventType, fileName) => {
      events.push({ eventType, fileName: fileName === null ? null : String(fileName) });
    });
    await sleepMilliseconds(WATCH_SETTLE_MILLISECONDS);
    writeFileSync(join(folder, 'early.txt'), 'early\n');
    await sleepMilliseconds(WATCH_SETTLE_MILLISECONDS);
    mkdirSync(join(folder, 'later', 'deeper'), { recursive: true });
    await sleepMilliseconds(WATCH_SETTLE_MILLISECONDS);
    writeFileSync(join(folder, 'later', 'deeper', 'late.txt'), 'late\n');
    await sleepMilliseconds(WATCH_SETTLE_MILLISECONDS);
    watcher.close();
    return { events };
  },
});
