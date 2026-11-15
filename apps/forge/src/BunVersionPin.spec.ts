/**
 * `.bun-version`, at the workspace root, pins the Bun the repository runs on. It must match the `@types/bun` version the root's
 * `bun.lock` holds, since the types and the runtime describe one release; a drift, and a lock that no longer names the package, are
 * planted to prove the check names both.
 */
import { readFileSync } from 'node:fs';
import { join }         from 'node:path';

import { describe, expect, test } from 'bun:test';

import { repositoryRootOfThisCheckout } from './testing/ImportGraph.ts';
import { workspaceRootOfProgram }       from './testing/RepositorySources.ts';

const LOCKED_TYPES_ENTRY = /"@types\/bun": \["@types\/bun@([^"]+)"/;

function bunPinDriftOf(pinnedVersion: string, lockText: string): string | null {
  const lockedVersion = LOCKED_TYPES_ENTRY.exec(lockText)?.[1];
  if (lockedVersion === undefined) return 'bun.lock locks no @types/bun';
  return lockedVersion === pinnedVersion ? null : `.bun-version is ${pinnedVersion}, bun.lock locks @types/bun ${lockedVersion}`;
}

const WORKSPACE_ROOT = workspaceRootOfProgram(repositoryRootOfThisCheckout());

describe('the pinned Bun version', () => {
  test('.bun-version holds 1.4.2, the @types/bun version bun.lock locks', () => {
    const pinnedVersion = readFileSync(join(WORKSPACE_ROOT, '.bun-version'), 'utf8').trim();
    expect(pinnedVersion).toBe('1.4.2');
    expect(bunPinDriftOf(pinnedVersion, readFileSync(join(WORKSPACE_ROOT, 'bun.lock'), 'utf8'))).toBeNull();
  });

  test('a pin behind the lock is named with both versions', () => {
    expect(bunPinDriftOf('1.3.0', '"@types/bun": ["@types/bun@1.4.2", "", {}],')).toBe('.bun-version is 1.3.0, bun.lock locks @types/bun 1.4.2');
  });

  test('a lock without @types/bun is a drift, never a pass', () => {
    expect(bunPinDriftOf('1.4.2', '"typescript": ["typescript@5.9.3", "", {}],')).toBe('bun.lock locks no @types/bun');
  });
});
