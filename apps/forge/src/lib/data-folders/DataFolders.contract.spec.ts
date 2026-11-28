/** One contract for the `DataFolders` port: every folder is absolute under the adapter's own path module; no adapter must still start. */
import { tmpdir } from 'node:os';
import { join }   from 'node:path';

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
    const systemFolder = dataFolders.systemFolder();
    expect(systemFolder.verdict === 'found' && pathModule.isAbsolute(systemFolder.folder)).toBe(true);
    expect(dataFolders.monitorFolderOf('/Users/alex-example')).toBe(pathModule.join('/Users/alex-example', '.example-monitor'));
    expect(dataFolders.temporaryFolderOf({})).toBeNull();
  },
}];

runPortContract('DataFolders', [
  {
    name:  'PosixDataFolders on an injected temporary folder',
    build: () => createPosixDataFolders({ temporaryDirectory: () => '/example/temporary', monitorFolderName: '.example-monitor', foldsCase: false }),
  },
  { name: 'the native adapter', build: () => dataFoldersFor('darwin', '.example-monitor') },
  {
    name:  'WindowsDataFolders on an injected temporary folder',
    build: () => createWindowsDataFolders({ temporaryDirectory: () => 'C:\\Example\\Temporary', monitorFolderName: '.example-monitor', systemRoot: () => 'C:\\Windows' }),
  },
  { name: 'the win32 selector', build: () => dataFoldersFor('win32', '.example-monitor', () => 'C:\\Windows') },
], CLAUSES);

test('the temporary roots are the machine\'s own folder, then the two every Unix machine has', () => {
  const dataFolders = createPosixDataFolders({ temporaryDirectory: () => '/example/temporary', monitorFolderName: '', foldsCase: false });
  expect(dataFolders.temporaryRoots()).toEqual(['/example/temporary', '/tmp', '/var/tmp']);
});

test('a POSIX child\'s temporary folder is its TMPDIR, and TEMP means nothing there', () => {
  const dataFolders = createPosixDataFolders({ temporaryDirectory: () => '/example/temporary', monitorFolderName: '', foldsCase: false });
  expect(dataFolders.temporaryFolderOf({ TMPDIR: '/example/child' })).toBe('/example/child');
  expect(dataFolders.temporaryFolderOf({ TEMP: '/example/child' })).toBeNull();
});

test('a Windows child\'s temporary folder is its TEMP under any spelling, and TMPDIR means nothing there', () => {
  const dataFolders = createWindowsDataFolders({ temporaryDirectory: () => 'C:\\Example\\Temporary', monitorFolderName: '', systemRoot: () => undefined });
  expect(dataFolders.temporaryFolderOf({ TEMP: 'C:\\Example\\Child' })).toBe('C:\\Example\\Child');
  expect(dataFolders.temporaryFolderOf({ Temp: 'C:\\Example\\Child' })).toBe('C:\\Example\\Child');
  expect(dataFolders.temporaryFolderOf({ TMPDIR: 'C:\\Example\\Child' })).toBeNull();
});

test('Windows folders join with a backslash and the root is the machine\'s own', () => {
  const dataFolders = createWindowsDataFolders({ temporaryDirectory: () => 'C:\\Example\\Temporary', monitorFolderName: '.example-monitor', systemRoot: () => undefined });
  expect(dataFolders.temporaryRoots()).toEqual(['C:\\Example\\Temporary']);
  expect(dataFolders.monitorFolderOf('C:\\Users\\example')).toBe('C:\\Users\\example\\.example-monitor');
});

test('the Windows system folder sits under SystemRoot, a Windows off C: included, and none is guessed without a drive-absolute one', () => {
  const temporaryDirectory = (): string => 'D:\\Example\\Temporary';
  const dataFoldersUnder = (systemRoot: string | undefined): DataFolders => createWindowsDataFolders({ temporaryDirectory, monitorFolderName: '', systemRoot: () => systemRoot });
  expect(dataFoldersUnder('D:\\Windows').systemFolder()).toEqual({ verdict: 'found', folder: 'D:\\Windows\\System32' });
  expect(dataFoldersUnder('D:\\Windows\\').systemFolder()).toEqual({ verdict: 'found', folder: 'D:\\Windows\\System32' });
  for (const unusableRoot of [undefined, '', 'Windows', '\\Windows']) {
    expect(dataFoldersUnder(unusableRoot).systemFolder()).toEqual({ verdict: 'refused', cause: 'no-drive-absolute-system-root' });
  }
});

test('names fold case on macOS and Windows but not on Linux', () => {
  expect(dataFoldersFor('darwin', '').foldsCase).toBe(true);
  expect(dataFoldersFor('win32', '').foldsCase).toBe(true);
  expect(dataFoldersFor('linux', '').foldsCase).toBe(false);
});

test('Windows names bin and Scripts as executable folders and four runnable extensions; POSIX names only bin and no extension', () => {
  expect(dataFoldersFor('win32', '').executableFolderNames).toEqual(['bin', 'Scripts']);
  expect(dataFoldersFor('win32', '').executableFileExtensions).toEqual(['.exe', '.cmd', '.bat', '.ps1']);
  expect(dataFoldersFor('linux', '').executableFolderNames).toEqual(['bin']);
  expect(dataFoldersFor('darwin', '').executableFileExtensions).toEqual([]);
});

test('a platform with no adapter keeps the machine\'s own scratch root and monitor folder, so a process starts, and refuses the system folder', () => {
  const dataFolders = dataFoldersFor('example-platform', '.example-monitor');
  expect(dataFolders.temporaryRoots()).toEqual([tmpdir()]);
  expect(dataFolders.temporaryFolderOf({ TMPDIR: '/example' })).toBeNull();
  expect(dataFolders.monitorFolderOf('/home')).toBe(join('/home', '.example-monitor'));
  expect(dataFolders.systemFolder()).toEqual({ verdict: 'refused', cause: 'no-adapter' });
});
