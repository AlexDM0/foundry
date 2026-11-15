/**
 * How a path of this machine prints. What matters: a path under the home folder, and the home folder itself, print from `~`; a path
 * elsewhere, or one whose folder only starts with the home folder's name, prints whole.
 */
import { describe, expect, test } from 'bun:test';

import { PathTextUtil } from './PathTextUtil.ts';

const HOME_FOLDER = '/Users/alexexample';

describe('a path printed from the home folder', () => {
  test('prints a path under the home folder, and the home folder itself, from ~', () => {
    expect(PathTextUtil.homeRelativePathOf('/Users/alexexample/.bun/bin/forge', HOME_FOLDER)).toBe('~/.bun/bin/forge');
    expect(PathTextUtil.homeRelativePathOf(HOME_FOLDER, HOME_FOLDER)).toBe('~');
  });

  test('prints a path outside the home folder whole, also one whose folder only starts with the home folder\'s name', () => {
    expect(PathTextUtil.homeRelativePathOf('/opt/homebrew/bin/forge', HOME_FOLDER)).toBe('/opt/homebrew/bin/forge');
    expect(PathTextUtil.homeRelativePathOf('/Users/alexexample-old/forge', HOME_FOLDER)).toBe('/Users/alexexample-old/forge');
  });
});
