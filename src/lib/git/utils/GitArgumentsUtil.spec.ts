/**
 * The forms a git spawn carries beside its verb. What matters: `-c` arguments and `GIT_CONFIG_*` pairs hold the same settings in order, and
 * a path list is cut into runs each under the limit, in order, losing no path, with an over-long path alone in its run.
 */
import { describe, expect, test } from 'bun:test';

import { GitArgumentsUtil } from './GitArgumentsUtil.ts';

const SETTINGS = [['core.longpaths', 'true'], ['core.hooksPath', '/example/hooks']] as const;

describe('settings as arguments and as an environment', () => {
  test('each setting is one `-c key=value` pair, in order', () => {
    expect(GitArgumentsUtil.overrideArgumentsOf(SETTINGS)).toEqual(['-c', 'core.longpaths=true', '-c', 'core.hooksPath=/example/hooks']);
  });

  test('the environment counts the settings and numbers each key and value from 0', () => {
    expect(GitArgumentsUtil.environmentOf(SETTINGS)).toEqual({
      GIT_CONFIG_COUNT:   '2',
      GIT_CONFIG_KEY_0:   'core.longpaths',
      GIT_CONFIG_VALUE_0: 'true',
      GIT_CONFIG_KEY_1:   'core.hooksPath',
      GIT_CONFIG_VALUE_1: '/example/hooks',
    });
  });
});

describe('pathspec chunks', () => {
  test('paths are cut into runs under the limit, in order, losing none', () => {
    const paths = Array.from({ length: 10 }, (_unused, i) => `example-${i}.txt`);
    const chunks = GitArgumentsUtil.pathspecChunksOf(paths, 40);
    expect(chunks.flat()).toEqual(paths);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) expect(chunk.join(' ').length).toBeLessThan(40);
  });

  test('a path longer than the limit is a run of its own, and no path list is no run', () => {
    expect(GitArgumentsUtil.pathspecChunksOf(['a.txt', 'example-long-path.txt', 'b.txt'], 10)).toEqual([['a.txt'], ['example-long-path.txt'], ['b.txt']]);
    expect(GitArgumentsUtil.pathspecChunksOf([], 10)).toEqual([]);
  });
});
