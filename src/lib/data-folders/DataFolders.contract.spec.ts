/** One contract for the `DataFolders` port: every folder is absolute under the adapter's own path module; no adapter must still start. */
import { tmpdir } from 'node:os';

import { expect, test } from 'bun:test';

import { type PortClause, runPortContract } from '../../testing/PortContract.ts';
import type { DataFolders }                 from './DataFolders.ts';
import { dataFoldersFor }                   from './DataFoldersFor.ts';
import { createPosixDataFolders }           from './PosixDataFolders.ts';

const CLAUSES: readonly PortClause<DataFolders>[] = [{
  claim: 'answers absolute folders, the monitor folder under the home folder',
  check: (dataFolders) => {
    const { pathModule } = dataFolders;
    expect(dataFolders.temporaryRoots().every((root) => pathModule.isAbsolute(root))).toBe(true);
    expect(dataFolders.temporaryRoots().length).toBeGreaterThan(0);
    expect(pathModule.isAbsolute(dataFolders.systemFolder())).toBe(true);
    expect(dataFolders.monitorFolderOf('/Users/alex-example')).toBe('/Users/alex-example/.example-monitor');
  },
}];

runPortContract('DataFolders', [
  {
    name:  'PosixDataFolders on an injected temporary folder',
    build: () => createPosixDataFolders({ temporaryDirectory: () => '/example/temporary', monitorFolderName: '.example-monitor' }),
  },
  { name: 'the native adapter', build: () => dataFoldersFor('darwin', '.example-monitor') },
], CLAUSES);

test('the temporary roots are the machine\'s own folder, then the two every Unix machine has', () => {
  expect(createPosixDataFolders({ temporaryDirectory: () => '/example/temporary', monitorFolderName: '' }).temporaryRoots()).toEqual(['/example/temporary', '/tmp', '/var/tmp']);
});

test('a platform with no adapter keeps the machine\'s own scratch root, so a process starts, and refuses a folder', () => {
  const dataFolders = dataFoldersFor('win32', '.example-monitor');
  expect(dataFolders.temporaryRoots()).toEqual([tmpdir()]);
  expect(() => dataFolders.monitorFolderOf('/home')).toThrow('win32');
  expect(() => dataFolders.systemFolder()).toThrow('win32');
});
