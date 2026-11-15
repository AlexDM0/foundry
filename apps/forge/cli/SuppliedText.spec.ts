/**
 * The one decoder for text a user supplies. What matters: a byte order mark picks UTF-8 or UTF-16 and is not part of the text; text with no
 * byte order mark comes back exactly as its bytes, line endings included; and bytes that are not text are refused by name, never stored
 * garbled.
 */
import { expect, test } from 'bun:test';

import { OperationRefusal } from '../src/shared/OperationRefusal.ts';
import { suppliedTextOf }   from './SuppliedText.ts';

const SOURCE_NAME = '--body-file body.md';
const TEXT = '## Report\r\nWritten by Alex Example: café, 例.\r\n';

function refusalOf(bytes: Uint8Array): OperationRefusal {
  try {
    suppliedTextOf(bytes, SOURCE_NAME);
  } catch (problem) {
    if (problem instanceof OperationRefusal) return problem;
    throw problem;
  }
  throw new Error('the bytes were not refused');
}

test('UTF-8 with no byte order mark comes back exactly as its bytes, CRLF and all', () => {
  const bytes = Buffer.from(TEXT, 'utf8');
  expect(suppliedTextOf(bytes, SOURCE_NAME)).toBe(TEXT);
  expect(Buffer.from(suppliedTextOf(bytes, SOURCE_NAME), 'utf8').equals(bytes)).toBe(true);
});

test('a UTF-8 byte order mark is skipped', () => {
  expect(suppliedTextOf(Buffer.from(`\uFEFF${TEXT}`, 'utf8'), SOURCE_NAME)).toBe(TEXT);
});

test('UTF-16 LE behind its byte order mark, Windows PowerShell 5.1\'s default output, decodes to its text', () => {
  expect(suppliedTextOf(Buffer.from(`\uFEFF${TEXT}`, 'utf16le'), SOURCE_NAME)).toBe(TEXT);
});

test('UTF-16 BE behind its byte order mark decodes to its text', () => {
  const bytes = Buffer.from(`\uFEFF${TEXT}`, 'utf16le').swap16();
  expect(suppliedTextOf(bytes, SOURCE_NAME)).toBe(TEXT);
});

test('bytes that are not valid UTF-8 are refused, naming the source and the encoding', () => {
  const refusal = refusalOf(new Uint8Array([0x23, 0xC3, 0x28]));
  expect(refusal.status).toBe('refused');
  expect(refusal.message).toStartWith('--body-file body.md is not valid UTF-8 text');
});

test('UTF-16 with no byte order mark, which reads as UTF-8 full of NULs, is refused', () => {
  expect(refusalOf(Buffer.from('## Report\r\nWritten by Alex Example.\r\n', 'utf16le')).message).toStartWith('--body-file body.md holds a NUL character');
});
