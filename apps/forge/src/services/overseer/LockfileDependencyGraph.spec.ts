/**
 * The part of a planted `bun.lock` one workspace member runs on. What matters: dependencies are followed through each package's own
 * dependencies, peers and optional ones, into the workspace packages the member names; a nested entry wins over the hoisted one of the
 * same name, as Node resolves it; another member's dependencies stay out; and a lockfile that is missing or not JSONC yields an empty
 * graph rather than a throw, so the code version still reads.
 */
import { describe, expect, test } from 'bun:test';

import { lockfileDependencyGraphOf } from './LockfileDependencyGraph.ts';

const PLANTED_LOCKFILE_TEXT = `{
  "lockfileVersion": 1,
  "workspaces": {
    "": { "name": "example-workspace", "devDependencies": { "example-linter": "1.0.0" } },
    "apps/example-app": { "name": "example-app", "dependencies": { "example-package": "workspace:^", "example-library": "1.0.0" } },
    "apps/other-app": { "name": "other-app", "dependencies": { "other-library": "1.0.0" } },
    "packages/example-package": { "name": "example-package", "peerDependencies": { "example-peer": ">=1" } },
  },
  "packages": {
    "example-package": ["example-package@workspace:packages/example-package"],
    "example-library": ["example-library@1.0.0", "", { "dependencies": { "shared-helper": "^2.0.0" }, "optionalDependencies": { "example-optional": "1.0.0" } }, "sha512-example"],
    "example-library/shared-helper": ["shared-helper@2.0.0", "", {}, "sha512-example"],
    "shared-helper": ["shared-helper@1.0.0", "", {}, "sha512-example"],
    "example-optional": ["example-optional@1.0.0", "", {}, "sha512-example"],
    "example-peer": ["example-peer@1.0.0", "", {}, "sha512-example"],
    "other-library": ["other-library@1.0.0", "", { "dependencies": { "shared-helper": "^1.0.0" } }, "sha512-example"],
    "example-linter": ["example-linter@1.0.0", "", {}, "sha512-example"],
  },
}
`;

describe('lockfileDependencyGraphOf', () => {
  test('follows the member\'s dependencies, their dependencies, optional ones and a workspace package\'s peers', () => {
    const graph = lockfileDependencyGraphOf(PLANTED_LOCKFILE_TEXT, 'apps/example-app');
    expect(graph.workspaceFolders).toEqual(['apps/example-app', 'packages/example-package']);
    expect(Object.keys(graph.entries).sort()).toEqual([
      'example-library',
      'example-library/shared-helper',
      'example-optional',
      'example-package',
      'example-peer',
      'workspace:apps/example-app',
      'workspace:packages/example-package',
    ]);
  });

  test('a nested entry is taken over the hoisted entry of the same name, which only another member reaches', () => {
    const graph = lockfileDependencyGraphOf(PLANTED_LOCKFILE_TEXT, 'apps/example-app');
    expect(Object.hasOwn(graph.entries, 'shared-helper')).toBe(false);
    expect(graph.entries['example-library/shared-helper']).toEqual(['shared-helper@2.0.0', '', {}, 'sha512-example']);
  });

  test('another member\'s dependencies and the root\'s tools stay out of the graph', () => {
    const graph = lockfileDependencyGraphOf(PLANTED_LOCKFILE_TEXT, 'apps/other-app');
    expect(Object.keys(graph.entries).sort()).toEqual(['other-library', 'shared-helper', 'workspace:apps/other-app']);
  });

  test.each([
    ['an empty text', ''],
    ['a text that is not JSONC', '{ "workspaces": '],
  ])('%s yields an empty graph', (_lockfileName, lockfileText) => {
    expect(lockfileDependencyGraphOf(lockfileText, 'apps/example-app')).toEqual({ workspaceFolders: [], entries: {} });
  });
});
