/**
 * The body hash a claim records and the comparison it answers. What matters: the hash is 64-bit FNV-1a over UTF-8 bytes, so it matches the
 * published vectors and never hashes UTF-16 code units; it is always sixteen hex digits, leading zeros kept, so two stored hashes compare
 * as text; and a ticket never claimed has no answer rather than a guessed one. The vectors for `''`, `a` and `foobar` are the published
 * FNV-1a 64 vectors; the others were taken from an independent FNV-1a 64 over the UTF-8 bytes.
 */
import { describe, expect, test } from 'bun:test';

import { ticketFixture }      from '../../../testing/BoardFixtures.ts';
import { TicketBodyHashUtil } from './TicketBodyHashUtil.ts';

const { bodyChangedSinceClaimOf, bodyHashOf } = TicketBodyHashUtil;

describe('bodyHashOf', () => {
  test('matches the published FNV-1a 64 vectors', () => {
    expect(bodyHashOf('')).toBe('cbf29ce484222325');
    expect(bodyHashOf('a')).toBe('af63dc4c8601ec8c');
    expect(bodyHashOf('foobar')).toBe('85944171f73967e8');
  });

  test('hashes the UTF-8 bytes of a character outside ASCII, not its UTF-16 code unit', () => {
    expect(bodyHashOf('é')).toBe('0ac21707b7181e01');
  });

  test('keeps the leading zeros, so every hash is sixteen hex digits', () => {
    expect(bodyHashOf('Example body 2160')).toBe('0000261758faacde');
  });

  test('changes with a single changed byte of the body', () => {
    expect(bodyHashOf('Example body\n')).toBe('749d6d42002f8023');
    expect(bodyHashOf('Example body\r\n')).not.toBe(bodyHashOf('Example body\n'));
  });
});

describe('bodyChangedSinceClaimOf', () => {
  test('has no answer for a ticket never claimed', () => {
    expect(bodyChangedSinceClaimOf(ticketFixture())).toBeUndefined();
  });

  test('is false while the body hashes to the claimed hash', () => {
    const ticket = { ...ticketFixture({ claimedBodyHash: bodyHashOf('Example body\n') }), body: 'Example body\n' };
    expect(bodyChangedSinceClaimOf(ticket)).toBe(false);
  });

  test('is true once the body no longer hashes to the claimed hash', () => {
    const ticket = { ...ticketFixture({ claimedBodyHash: bodyHashOf('Example body\n') }), body: 'Example body, edited\n' };
    expect(bodyChangedSinceClaimOf(ticket)).toBe(true);
  });
});
