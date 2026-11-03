/**
 * The session banners' wording. What matters: both name the product's program with `open`, the refused code says another process may
 * have used it, and the lost session says nothing of a code.
 */
import { describe, expect, test } from 'bun:test';

import { PRODUCT_NAMES }      from '../../src/shared/constants/ProductNames.ts';
import { SessionWordingUtil } from './SessionWordingUtil.ts';

describe('SessionWordingUtil', () => {
  test('A6: the command named is the product program with open', () => {
    expect(SessionWordingUtil.openCommand()).toBe(`${PRODUCT_NAMES.PROGRAM} open`);
  });

  test('A3: a refused code reads as used or expired, perhaps by another process, and asks for open again', () => {
    const banner = SessionWordingUtil.bannerOf('code-refused');
    expect(banner).toContain('already used or expired');
    expect(banner).toContain('another process may have used it');
    expect(banner).toContain(`Run \`${PRODUCT_NAMES.PROGRAM} open\` again.`);
  });

  test('A4: no session asks for open again and names no code', () => {
    const banner = SessionWordingUtil.bannerOf('no-session');
    expect(banner).toContain(`Run \`${PRODUCT_NAMES.PROGRAM} open\` again.`);
    expect(banner).not.toContain('code');
  });
});
