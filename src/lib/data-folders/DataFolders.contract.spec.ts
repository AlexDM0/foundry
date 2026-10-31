/** One contract for the `DataFolders` port: every folder is absolute under the adapter's own path module; no adapter must still start. */
import { tmpdir } from 'node:os';

import { expect, test } from 'bun:test';

import { type PortClause, runPortContract } from '../../testing/PortContract.ts';
import type { DataFolders }                 from './DataFolders.ts';
import { dataFoldersFor }                   from './DataFoldersFor.ts';
import { createPosixDataFolders }           from './PosixDataFolders.ts';
import { createWindowsDataFolders }         from './WindowsDataFolders.ts';

const CLAUSES: readonly PortClause<DataFolders>[] = [{
  claim: 'answers absolute folders, the monitor folder under the home folder, and no temporary folder an environment does not name',
  check: (dataFolders) => {
    const { pathModule } = dataFolders;
    expect(dataFolders.temporaryRoots().every((root) => pathModule.isAbsolute(root))).toBe(true);
    expect(dataFolders.temporaryRoots().length).toBeGreaterThan(0);
    expect(pathModule.isAbsolute(dataFolders.systemFolder())).toBe(true);
    expect(dataFolders.monitorFolderOf('/Users/alex-example')).toBe(pathModule.join('/Users/alex-example', '.example-monitor'));
    expect(dataFolders.temporaryFolderOf({})).toBeNull();
  },
}];

runPortContract('DataFolders', [
  {
    name:  'PosixDataFolders on an injected temporary folder',
    build: () => createPosixDataFolders({ temporaryDirectory: () => '/example/temporary', monitorFolderName: '.example-monitor' }),
  },
  { name: 'the native adapter', build: () => dataFoldersFor('darwin', '.example-monitor') },
  {
    name:  'WindowsDataFolders on an injected temporary folder',
    build: () => createWindowsDataFolders({ temporaryDirectory: () => 'C:\\Example\\Temporary', monitorFolderName: '.example-monitor' }),
  },
  { name: 'the win32 selector', build: () => dataFoldersFor('win32', '.example-monitor') },
], CLAUSES);

test('the temporary roots are the machine\'s own folder, then the two every Unix machine has', () => {
  expect(createPosixDataFolders({ temporaryDirectory: () => '/example/temporary', monitorFolderName: '' }).temporaryRoots()).toEqual(['/example/temporary', '/tmp', '/var/tmp']);
});

test('a POSIX child\'s temporary folder is its TMPDIR, and TEMP means nothing there', () => {
  const dataFolders = createPosixDataFolders({ temporaryDirectory: () => '/example/temporary', monitorFolderName: '' });
  expect(dataFolders.temporaryFolderOf({ TMPDIR: '/example/child' })).toBe('/example/child');
  expect(dataFolders.temporaryFolderOf({ TEMP: '/example/child' })).toBeNull();
});

test('a Windows child\'s temporary folder is its TEMP under any spelling, and TMPDIR means nothing there', () => {
  const dataFolders = createWindowsDataFolders({ temporaryDirectory: () => 'C:\\Example\\Temporary', monitorFolderName: '' });
  expect(dataFolders.temporaryFolderOf({ TEMP: 'C:\\Example\\Child' })).toBe('C:\\Example\\Child');
  expect(dataFolders.temporaryFolderOf({ Temp: 'C:\\Example\\Child' })).toBe('C:\\Example\\Child');
  expect(dataFolders.temporaryFolderOf({ TMPDIR: 'C:\\Example\\Child' })).toBeNull();
});

test('Windows folders join with a backslash and the root is the machine\'s own', () => {
  const dataFolders = createWindowsDataFolders({ temporaryDirectory: () => 'C:\\Example\\Temporary', monitorFolderName: '.example-monitor' });
  expect(dataFolders.temporaryRoots()).toEqual(['C:\\Example\\Temporary']);
  expect(dataFolders.monitorFolderOf('C:\\Users\\example')).toBe('C:\\Users\\example\\.example-monitor');
});

test('a platform with no adapter keeps the machine\'s own scratch root, so a process starts, and refuses a folder', () => {
  const dataFolders = dataFoldersFor('example-platform', '.example-monitor');
  expect(dataFolders.temporaryRoots()).toEqual([tmpdir()]);
  expect(dataFolders.temporaryFolderOf({ TMPDIR: '/example' })).toBeNull();
  expect(() => dataFolders.monitorFolderOf('/home')).toThrow('example-platform');
  expect(() => dataFolders.systemFolder()).toThrow('example-platform');
});
