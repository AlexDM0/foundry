/**
 * The launcher `open` hands the page to is chosen from the context's platform, never the test runner's, so both
 * branches are pinned on any machine: macOS has `open`, and every other platform is sent to `xdg-open`.
 */
import { describe, expect, test } from 'bun:test';

import { openerFor } from './OpenerFor.ts';

describe('openerFor', () => {
  test('macOS opens the page with `open`', () => {
    expect(openerFor('darwin').argv[0]).toBe('open');
  });

  test('every other platform opens the page with `xdg-open`', () => {
    expect(openerFor('linux').argv[0]).toBe('xdg-open');
    expect(openerFor('freebsd').argv[0]).toBe('xdg-open');
  });
});
