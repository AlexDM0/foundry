/**
 * The util's contract under injected path modules, so this machine proves the Windows answers too: nesting must not match on a shared
 * prefix, must fold case only where the style says, and a wire path must read the same on every host. The instruction guard must refuse
 * every way out of its root, a backslash included.
 */
import { posix, win32 } from 'node:path';

import { describe, expect, test } from 'bun:test';

import { type PathStyle, PathNestingUtil } from './PathNestingUtil.ts';

const LINUX: PathStyle   = { pathModule: posix, foldsCase: false };
const MACOS: PathStyle   = { pathModule: posix, foldsCase: true };
const WINDOWS: PathStyle = { pathModule: win32, foldsCase: true };

describe('isInside and nestsWith', () => {
  test.each([
    ['linux', LINUX, '/home/example/cache', '/home/example', true],
    ['linux', LINUX, '/home/example', '/home/example', true],
    ['linux', LINUX, '/home/example-other', '/home/example', false],
    ['linux', LINUX, '/home/Example/cache', '/home/example', false],
    ['linux', LINUX, '/home/..cache', '/home', true],
    ['macos', MACOS, '/Users/Example/cache', '/users/example', true],
    ['windows', WINDOWS, 'C:\\Users\\Example\\cache', 'c:\\users\\example', true],
    ['windows', WINDOWS, 'C:/Users/Example/cache', 'C:\\Users\\Example', true],
    ['windows', WINDOWS, 'C:\\Users\\Example-other', 'C:\\Users\\Example', false],
    ['windows', WINDOWS, 'D:\\Users\\Example', 'C:\\Users\\Example', false],
  ] as const)('on %s, %s inside %s is %p', (_host, style, path, folder, inside) => {
    expect(PathNestingUtil.isInside(style, path, folder)).toBe(inside);
  });

  test('nesting holds either way round and not for siblings', () => {
    expect(PathNestingUtil.nestsWith(WINDOWS, 'C:\\tools', 'C:\\tools\\cache')).toBe(true);
    expect(PathNestingUtil.nestsWith(WINDOWS, 'C:\\tools\\cache', 'C:\\tools')).toBe(true);
    expect(PathNestingUtil.nestsWith(LINUX, '/opt/tools', '/opt/tools-cache')).toBe(false);
  });
});

describe('segmentsOf and namesMatch', () => {
  test('Windows splits on both separators; POSIX keeps a backslash inside a name', () => {
    expect(PathNestingUtil.segmentsOf(WINDOWS, 'C:\\Users/example\\bin')).toEqual(['C:', 'Users', 'example', 'bin']);
    expect(PathNestingUtil.segmentsOf(LINUX, '/home/a\\b')).toEqual(['', 'home', 'a\\b']);
  });

  test('names match without case only where the style folds case', () => {
    expect(PathNestingUtil.namesMatch(WINDOWS, 'Bin', 'bin')).toBe(true);
    expect(PathNestingUtil.namesMatch(MACOS, 'Bin', 'bin')).toBe(true);
    expect(PathNestingUtil.namesMatch(LINUX, 'Bin', 'bin')).toBe(false);
  });
});

describe('wire paths', () => {
  test.each([
    ['/opt/cache', true],
    ['~/.cache', true],
    ['~\\AppData\\cache', true],
    ['C:\\cache', true],
    ['C:/cache', true],
    ['\\\\server\\share\\cache', true],
    ['C:cache', false],
    ['cache', false],
    ['~cache', false],
  ] as const)('%s is well formed on every host: %p', (wirePath, wellFormed) => {
    expect(PathNestingUtil.wirePathIsWellFormed(wirePath)).toBe(wellFormed);
  });

  test('a home-relative wire path joins under the style\'s module, an absolute one is kept', () => {
    expect(PathNestingUtil.absolutePathOfWirePath(WINDOWS, '~\\AppData\\cache', 'C:\\Users\\example')).toBe('C:\\Users\\example\\AppData\\cache');
    expect(PathNestingUtil.absolutePathOfWirePath(WINDOWS, '~/cache', 'C:\\Users\\example')).toBe('C:\\Users\\example\\cache');
    expect(PathNestingUtil.absolutePathOfWirePath(LINUX, '~/cache', '/home/example')).toBe('/home/example/cache');
    expect(PathNestingUtil.absolutePathOfWirePath(LINUX, 'C:\\cache', '/home/example')).toBe('C:\\cache');
  });

  test.each([
    ['docs/briefs/builder.md', true],
    ['.example-data/briefs/builder.md', true],
    ['.example-data/..\\..\\x', false],
    ['../outside.md', false],
    ['docs/../../outside.md', false],
    ['/etc/passwd', false],
    ['C:\\outside.md', false],
    ['C:outside.md', false],
    ['\\outside.md', false],
  ] as const)('the relative wire path %s stays inside its root: %p', (wirePath, staysInside) => {
    expect(PathNestingUtil.relativeWirePathStaysInside(wirePath)).toBe(staysInside);
  });
});
