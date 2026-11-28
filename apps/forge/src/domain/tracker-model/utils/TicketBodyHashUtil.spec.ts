/**
 * The model's hashes and a ticket's content hash: 64-bit FNV-1a over UTF-8 bytes, sixteen hex digits with leading zeros, over the title and
 * body as one record. The vectors for `''`, `a` and `foobar` are the published ones; the others came from an independent FNV-1a 64.
 */
import { describe, expect, test } from 'bun:test';

import { TicketBodyHashUtil } from './TicketBodyHashUtil.ts';

const { bodyHashOf, contentHashOf } = TicketBodyHashUtil;

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

describe('contentHashOf', () => {
  test('is the hash of the title and body as one canonical record', () => {
    expect(contentHashOf('Example title', 'Example body\n')).toBe(bodyHashOf(JSON.stringify({ title: 'Example title', body: 'Example body\n' })));
  });

  test('changes with the title alone and with the body alone', () => {
    const kept = contentHashOf('Example title', 'Example body\n');
    expect(contentHashOf('Example title, retitled', 'Example body\n')).not.toBe(kept);
    expect(contentHashOf('Example title', 'Example body, edited\n')).not.toBe(kept);
  });

  test('tells text at the end of the title from the same text at the start of the body', () => {
    expect(contentHashOf('Example a', 'b')).not.toBe(contentHashOf('Example ', 'ab'));
  });
});
