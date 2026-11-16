/**
 * Where a prepare step or a gate runs in a checkout. A tracker at its repository's root must run every step exactly where it always has,
 * a leading `/` included; a tracker below the root runs a step in its project's folder of the checkout, its `in` relative to that folder,
 * and a leading `/` relative to the checkout's root, so a gate may run the workspace's own script there.
 */
import { join } from 'node:path';

import { describe, expect, test } from 'bun:test';

import { GateRun } from './GateRun.ts';

const CHECKOUT = '/example/repository/apps/forge/.example-worktrees/ticket-7';
const PROJECT_PREFIX = 'apps/forge';

describe('a tracker at its repository\'s root', () => {
  test.each([
    ['no in', {}, CHECKOUT],
    ['a folder', { in: 'bridge' }, join(CHECKOUT, 'bridge')],
    ['a folder leading with /', { in: '/bridge' }, join(CHECKOUT, 'bridge')],
  ])('runs a step with %s where it always has', (_caseName, step, folder) => {
    expect(GateRun.gateDirectoryOf(CHECKOUT, step)).toBe(folder);
    expect(GateRun.gateDirectoryOf(CHECKOUT, step, '')).toBe(folder);
  });

  test('hands back the checkout spelled as it was given when the step names no folder', () => {
    expect(GateRun.gateDirectoryOf(`${CHECKOUT}/`, {})).toBe(`${CHECKOUT}/`);
  });
});

describe('a tracker below its repository\'s root', () => {
  test.each([
    ['no in runs in the project\'s folder', {}, join(CHECKOUT, PROJECT_PREFIX)],
    ['a folder is relative to the project', { in: 'bridge' }, join(CHECKOUT, PROJECT_PREFIX, 'bridge')],
    ['a lone / is the checkout\'s root', { in: '/' }, CHECKOUT],
    ['a folder leading with / is relative to the checkout\'s root', { in: '/packages/design-system' }, join(CHECKOUT, 'packages', 'design-system')],
  ])('%s', (_caseName, step, folder) => {
    expect(GateRun.gateDirectoryOf(CHECKOUT, step, PROJECT_PREFIX)).toBe(folder);
  });
});
