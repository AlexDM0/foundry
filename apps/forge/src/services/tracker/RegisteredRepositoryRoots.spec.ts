/**
 * The repository roots the machine-wide registry names. What matters: a tracker in a folder of its repository names the whole repository, two
 * trackers of one repository name it once, an entry with no root names nothing, and a registry that is absent, newer or not JSON names no root
 * rather than throwing, since an agent program check must still answer. A forge's agent tools may lie in none of them, nor in its own
 * repository and worktrees, though the registry names no forge.
 */
import { mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { join }                                   from 'node:path';

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test
} from 'bun:test';

import { WorktreesFolder }                                        from '../../shared/WorktreesFolder.ts';
import { createScratchDirectory, removeScratchDirectory }         from '../../testing/ScratchWorkspace.ts';
import { agentToolForbiddenRootsOf, registeredRepositoryRootsIn } from './RegisteredRepositoryRoots.ts';

let scratchDirectory = '';
let monitorFolder = '';

function repositoryAt(name: string): string {
  const repositoryRoot = join(scratchDirectory, name);
  mkdirSync(join(repositoryRoot, '.git'), { recursive: true });
  return realpathSync(repositoryRoot);
}

function writeRegistry(contents: string): void {
  writeFileSync(join(monitorFolder, 'projects.json'), contents);
}

beforeEach(() => {
  scratchDirectory = createScratchDirectory('registered-roots');
  monitorFolder = join(scratchDirectory, 'monitor');
  mkdirSync(monitorFolder);
});

afterEach(() => {
  removeScratchDirectory(scratchDirectory);
});

describe('the repository roots of the registered forges', () => {
  test('a tracker in a folder names its whole repository, and two trackers of one repository name it once', () => {
    const exampleRepository = repositoryAt('example-repository');
    const otherRepository = repositoryAt('other-repository');
    mkdirSync(join(exampleRepository, 'apps', 'example'), { recursive: true });
    writeRegistry(JSON.stringify({
      version:  2,
      projects: {
        'example-tracker':       { project: 'Example Agency', root: join(exampleRepository, 'apps', 'example') },
        'example-root-tracker':  { project: 'Example Agency', root: exampleRepository },
        'other-tracker':         { project: 'Example Other', root: otherRepository },
        'tracker-without-root':  { project: 'Example Rootless' },
        'tracker-not-an-object': 'example',
      },
    }));

    expect(registeredRepositoryRootsIn(monitorFolder).sort()).toEqual([exampleRepository, otherRepository].sort());
  });

  test('an absent registry, a newer one and one that is not JSON name no root', () => {
    expect(registeredRepositoryRootsIn(monitorFolder)).toEqual([]);
    writeRegistry(JSON.stringify({ version: 3, projects: { 'example-tracker': { root: repositoryAt('example-repository') } } }));
    expect(registeredRepositoryRootsIn(monitorFolder)).toEqual([]);
    writeRegistry('{ not json');
    expect(registeredRepositoryRootsIn(monitorFolder)).toEqual([]);
  });
});

describe('the roots no agent tool of a forge may lie in', () => {
  test('are its repository, its worktrees and every registered repository, each once', () => {
    const exampleRepository = repositoryAt('example-repository');
    const otherRepository = repositoryAt('other-repository');
    writeRegistry(JSON.stringify({ version: 2, projects: { 'example-tracker': { root: exampleRepository }, 'other-tracker': { root: otherRepository } } }));
    expect(agentToolForbiddenRootsOf(exampleRepository, monitorFolder)).toEqual([exampleRepository, WorktreesFolder.worktreesRootOf(exampleRepository), otherRepository]);
  });

  test('are its own repository and worktrees while the registry names no forge', () => {
    const exampleRepository = repositoryAt('example-repository');
    expect(agentToolForbiddenRootsOf(exampleRepository, monitorFolder)).toEqual([exampleRepository, WorktreesFolder.worktreesRootOf(exampleRepository)]);
  });
});
