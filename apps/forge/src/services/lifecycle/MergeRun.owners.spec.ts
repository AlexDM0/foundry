/**
 * Who takes a crossing ticket's conflict or red gate at landing: conflicted files go to the sealed package owning them first, in stage order,
 * the rest to the home, each part but the last leaving the merge open; a red gate goes to a sealed package for its own gate or one of an
 * entity consuming it, and otherwise to the home.
 */
import { describe, expect, test } from 'bun:test';

import type { PipelineEntity }            from '../../domain/tracker-model/@types/Pipeline.ts';
import { MergeRun, type CrossingLanding } from './MergeRun.ts';

function entityOf(kind: PipelineEntity['kind'], home: string, dependsOn: string[] = []): PipelineEntity {
  return {
    kind, home: [home], prepare: [], gates: [], phases: { build: [], review: [], merge: [] }, ...(dependsOn.length === 0 ? {} : { dependsOn }),
  };
}

const LANDING: CrossingLanding = {
  entities: {
    shop:   entityOf('app', '/apps/shop', ['tokens', 'icons']),
    admin:  entityOf('app', '/apps/admin', ['tokens']),
    blog:   entityOf('app', '/apps/blog'),
    icons:  entityOf('package', '/packages/icons', ['tokens']),
    tokens: entityOf('package', '/packages/tokens'),
  },
  homeEntity:     'shop',
  sealedPackages: ['tokens', 'icons'],
};

describe('a crossing ticket\'s conflict, by owner', () => {
  test('gives a sealed package its own files first, leaving the merge open while other files remain (E62, E64)', () => {
    const conflictedFiles = ['apps/shop/Cart.ts', 'packages/icons/Star.ts', 'packages/tokens/Colour.ts'];
    expect(MergeRun.firstConflictPartOf(LANDING, conflictedFiles)).toEqual({ packageEntity: 'tokens', files: ['packages/tokens/Colour.ts'], leavesTheMergeOpen: true, });
  });

  test('gives the last package that conflicts its files to commit when nothing else conflicts (E62)', () => {
    expect(MergeRun.firstConflictPartOf(LANDING, ['packages/icons/Star.ts'])).toEqual({ packageEntity: 'icons', files: ['packages/icons/Star.ts'], leavesTheMergeOpen: false, });
  });

  test('gives the home every file no sealed package owns, a root-owned lockfile among them, to commit (E63)', () => {
    const conflictedFiles = ['apps/shop/Cart.ts', 'bun.lock'];
    expect(MergeRun.firstConflictPartOf(LANDING, conflictedFiles)).toEqual({ packageEntity: null, files: conflictedFiles, leavesTheMergeOpen: false });
  });

  test('has no part with no conflicted file', () => {
    expect(MergeRun.firstConflictPartOf(LANDING, [])).toBeNull();
  });
});

describe('a crossing ticket\'s red gate, by owner (E65)', () => {
  test('goes to a sealed package for its own gate and for the gate of an entity that consumes it', () => {
    expect(MergeRun.redGateOwnerOf(LANDING, 'icons')).toEqual({ owner: 'package', packageEntity: 'icons' });
    expect(MergeRun.redGateOwnerOf(LANDING, 'admin')).toEqual({ owner: 'package', packageEntity: 'tokens' });
  });

  test('goes to the home for its own gate, an unnamed gate, and one of an entity no sealed package reaches', () => {
    expect(MergeRun.redGateOwnerOf(LANDING, 'shop')).toEqual({ owner: 'home' });
    expect(MergeRun.redGateOwnerOf(LANDING, undefined)).toEqual({ owner: 'home' });
    expect(MergeRun.redGateOwnerOf(LANDING, 'blog')).toEqual({ owner: 'home' });
  });
});
