/**
 * Windows spells its variables as it likes and compares them without case, so a name is matched folded and written as found, and the search
 * path splits on `;` because a drive letter holds a `:`. These cases run on any machine: the adapter only reads the record it is given.
 */
import { describe, expect, test } from 'bun:test';

import { launchEnvironmentFor } from './LaunchEnvironmentFor.ts';

const windows = launchEnvironmentFor('win32');

const WINDOWS_NAMES = [
  'Path',
  'SystemRoot',
  'windir',
  'ComSpec',
  'PATHEXT',
  'USERPROFILE',
  'HOMEDRIVE',
  'HOMEPATH',
  'APPDATA',
  'LOCALAPPDATA',
  'ProgramData',
  'ProgramFiles',
  'ProgramFiles(x86)',
  'TEMP',
  'TMP',
  'USERNAME',
  'NUMBER_OF_PROCESSORS',
  'PROCESSOR_ARCHITECTURE',
] as const;

function fakeHostEnvironmentSpeltBy(spell: (name: string) => string): Record<string, string> {
  return Object.fromEntries(WINDOWS_NAMES.map((name) => [spell(name), `value of ${name}`]));
}

describe('searchFoldersOf', () => {
  test('reads Path=C:\\a;C:\\b as two folders, the drive letters whole', () => {
    expect(windows.searchFoldersOf({ Path: 'C:\\a;C:\\b' })).toEqual(['C:\\a', 'C:\\b']);
  });

  test('finds the variable under any spelling and leaves out empty entries', () => {
    expect(windows.searchFoldersOf({ PATH: 'C:\\a;;C:\\b;' })).toEqual(['C:\\a', 'C:\\b']);
    expect(windows.searchFoldersOf({ path: 'C:\\a' })).toEqual(['C:\\a']);
  });
});

describe('launchEnvironmentOf', () => {
  const spellings: readonly (readonly [string, (name: string) => string])[] = [
    ['as Windows writes them', (name) => name],
    ['in upper case', (name) => name.toUpperCase()],
    ['in lower case', (name) => name.toLowerCase()],
  ];

  test.each(spellings)('keeps every name of the list spelt %s, written as found', (_spelling, spell) => {
    const hostEnvironment = fakeHostEnvironmentSpeltBy(spell);
    expect(windows.launchEnvironmentOf(hostEnvironment, {})).toEqual(hostEnvironment);
  });

  test('every name of the list is inherited, and nothing else crosses', () => {
    expect([...windows.inheritedVariableNames].sort()).toEqual([...WINDOWS_NAMES].sort());
    const environment = windows.launchEnvironmentOf({
      Path: 'C:\\a', ANTHROPIC_API_KEY: 'planted', HOME: 'C:\\planted', UNSET: undefined, TEMP: undefined
    }, {});
    expect(environment).toEqual({ Path: 'C:\\a' });
  });

  test('a job variable replaces an inherited one spelt differently, so the child never holds both', () => {
    const environment = windows.launchEnvironmentOf({ Path: 'C:\\inherited', TEMP: 'C:\\temp' }, { PATH: 'C:\\job', EXAMPLE_JOB: 'J1' });
    expect(environment).toEqual({ PATH: 'C:\\job', TEMP: 'C:\\temp', EXAMPLE_JOB: 'J1' });
  });
});
