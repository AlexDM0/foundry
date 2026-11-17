/**
 * The util's contract: an entity's folders read from the repository's root. What matters: a folder leading with `/` is kept as it is,
 * any other is under the first home however that home is written, a step or gate with no folder runs in the home itself, and a gate
 * keeps everything else it holds. An entity's constitution is the file it names, else `CONSTITUTION.md` in its first home, the root's at the
 * repository's root.
 */
import { describe, expect, test } from 'bun:test';

import { EntityFoldersUtil } from './EntityFoldersUtil.ts';

describe('rootedFolderOf', () => {
  test.each([
    ['/apps/web', 'src', '/apps/web/src'],
    ['/apps/web/', 'src', '/apps/web/src'],
    ['apps/web', 'src', '/apps/web/src'],
    ['/apps/web', undefined, '/apps/web'],
    ['/apps/web', '/packages/ui', '/packages/ui'],
    ['/', 'src', '/src'],
    ['/', undefined, '/'],
  ] as const)('home %s with folder %p reads %s', (firstHome, folder, rooted) => {
    expect(EntityFoldersUtil.rootedFolderOf(firstHome, folder)).toBe(rooted);
  });
});

test('every step runs in its folder read from the first home, named and run as before', () => {
  expect(EntityFoldersUtil.rootedStepsOf([
    { name: 'install', run: 'bun install' },
    { name: 'build', run: 'bun run build', in: 'tools' },
  ], '/apps/web')).toEqual([
    { name: 'install', run: 'bun install', in: '/apps/web' },
    { name: 'build', run: 'bun run build', in: '/apps/web/tools' },
  ]);
});

test('a gate keeps its line, network and writes, only its folder read from the first home', () => {
  const gate = {
    name: 'test', run: 'bun test', network: ['registry.example.com'], writes: ['coverage']
  };
  expect(EntityFoldersUtil.rootedGateOf(gate, '/apps/web')).toEqual({ ...gate, in: '/apps/web' });
  expect(gate).not.toHaveProperty('in');
});

describe('constitutionPathOf', () => {
  test.each([
    [['/apps/web'], undefined, 'apps/web/CONSTITUTION.md'],
    [['/apps/web/', '/apps/web-legacy'], undefined, 'apps/web/CONSTITUTION.md'],
    [['/'], undefined, 'CONSTITUTION.md'],
    [['/packages/ui'], 'packages/ui/docs/RULES.md', 'packages/ui/docs/RULES.md'],
  ] as const)('homes %p naming %p read %s', (home, constitutionPath, path) => {
    const entity = { home: [...home], ...(constitutionPath === undefined ? {} : { constitution: { path: constitutionPath } }) };
    expect(EntityFoldersUtil.constitutionPathOf(entity)).toBe(path);
  });
});
