/**
 * The notice lines `status` prints. What matters: the notice of passes abandoned in a row names their count, the reason as its stored
 * value and the reason in words, and says the forge keeps running, since an abandoned pass is no crash; it never calls them failed passes,
 * the name a ticket's failed job outcomes own.
 */
import { describe, expect, test } from 'bun:test';

import { HephaestusNoticeWording } from './HephaestusNoticeWording.ts';

describe('HephaestusNoticeWording.noticeTextOf, passes abandoned in a row', () => {
  test('a held lock names the count, the reason and that Hephaestus keeps running', () => {
    expect(HephaestusNoticeWording.noticeTextOf({ kind: 'passes-abandoned', inARow: 3, reason: 'tracker-lock-held' })).toBe(
      '3 drive passes in a row were abandoned (tracker-lock-held), the last as another process held the board\'s lock past its wait; '
      + 'Hephaestus keeps running and tries again at each wake-up',
    );
  });

  test('a lock taken over names its own reason, and neither sentence calls the passes failed', () => {
    const sentences = [
      HephaestusNoticeWording.noticeTextOf({ kind: 'passes-abandoned', inARow: 4, reason: 'lock-taken-over' }),
      HephaestusNoticeWording.noticeTextOf({ kind: 'passes-abandoned', inARow: 3, reason: 'tracker-lock-held' }),
    ];
    expect(sentences[0]).toBe(
      '4 drive passes in a row were abandoned (lock-taken-over), the last as another process took the board\'s lock over; '
      + 'Hephaestus keeps running and tries again at each wake-up',
    );
    for (const sentence of sentences) expect(sentence).not.toContain('failed');
  });
});
