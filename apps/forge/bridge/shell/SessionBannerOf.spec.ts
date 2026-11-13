/**
 * The session banners' wording. What matters: both ask to open the board again and name no command line, since User runs no command;
 * the refused code says another process may have used it, and the lost session says nothing of a code.
 */
import { describe, expect, test } from 'bun:test';

import { PRODUCT_NAMES }   from '../../src/shared/constants/ProductNames.ts';
import { sessionBannerOf } from './SessionBannerOf.ts';

describe('sessionBannerOf', () => {
  test('A6: neither banner names the program or a command line', () => {
    for (const banner of [sessionBannerOf('code-refused'), sessionBannerOf('no-session')]) {
      expect(banner).not.toContain(PRODUCT_NAMES.PROGRAM);
      expect(banner).not.toContain('`');
    }
  });

  test('A3: a refused code reads as used or expired, perhaps by another process, and asks to open the board again', () => {
    const banner = sessionBannerOf('code-refused');
    expect(banner).toContain('already used or expired');
    expect(banner).toContain('another process may have used it');
    expect(banner).toEndWith('Open the board again.');
  });

  test('A4: no session asks to open the board again and names no code', () => {
    const banner = sessionBannerOf('no-session');
    expect(banner).toEndWith('Open the board again.');
    expect(banner).not.toContain('code');
  });
});
