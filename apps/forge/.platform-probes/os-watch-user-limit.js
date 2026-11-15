// Whether fs.watch emits 'error' past max_user_watches. A tree past the limit is built only under a lowered limit,
// so lower `fs.inotify.max_user_watches` first; the limit and whether the tree was built are in the line.
import { mkdirSync, readFileSync, watch } from 'node:fs';
import { join } from 'node:path';

import { probe } from './support/probe.js';
import { errorFactsOf, sleepMilliseconds } from './support/programs.js';
import { scratchFolder } from './support/scratch.js';

const LARGEST_TREE_FOLDERS = 20_000;
const FOLDERS_PAST_THE_LIMIT = 100;
const WATCH_SETTLE_MILLISECONDS = 2000;

await probe({
  unknown: 'watch-user-limit',
  appliesTo: ['linux'],
  observe: async () => {
    const maxUserWatches = Number(readFileSync('/proc/sys/fs/inotify/max_user_watches', 'utf8').trim());
    if (maxUserWatches > LARGEST_TREE_FOLDERS) return { maxUserWatches, treeBuilt: false };
    const folder = scratchFolder();
    for (let i = 0; i < maxUserWatches + FOLDERS_PAST_THE_LIMIT; i += 1) mkdirSync(join(folder, `folder-${i}`));
    const errorEvents = [];
    let thrown = null;
    let watcher = null;
    try {
      watcher = watch(folder, { recursive: true });
      watcher.on('error', (error) => errorEvents.push(errorFactsOf(error)));
    } catch (error) {
      thrown = errorFactsOf(error);
    }
    await sleepMilliseconds(WATCH_SETTLE_MILLISECONDS);
    watcher?.close();
    return { maxUserWatches, treeBuilt: true, thrown, errorEvents };
  },
});
