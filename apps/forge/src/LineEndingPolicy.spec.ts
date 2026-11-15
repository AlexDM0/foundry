/**
 * The line-ending policy, the part that runs no git: `.gitattributes` holds every text file at LF on every checkout, since a carriage
 * return breaks `setup.sh`, the hooks, the prose wrap and the frozen tables, and no repository file of the folder walk holds one. A file is
 * text unless a NUL byte makes it truly binary. Each form is planted in memory to prove the scan names it and passes what it skips.
 * `src/lib/git/LineEndingPolicy.integration.spec.ts` holds what git itself answers: the attributes it applies and both sides of `git ls-files --eol`.
 */
import { readFileSync } from 'node:fs';
import { join }         from 'node:path';

import { describe, expect, test } from 'bun:test';

import { repositoryRootOfThisCheckout } from './testing/ImportGraph.ts';
import { repositoryFilePaths }          from './testing/RepositorySources.ts';

const LINE_ENDING_POLICY = '* text=auto eol=lf';

const CARRIAGE_RETURN_BYTE = 0x0d;
const NUL_BYTE             = 0x00;

const REPOSITORY_ROOT = repositoryRootOfThisCheckout();

function holdsACarriageReturnAsText(bytes: Uint8Array): boolean {
  return bytes.includes(CARRIAGE_RETURN_BYTE) && !bytes.includes(NUL_BYTE);
}

function carriageReturnHoldersAmong(files: readonly { path: string; bytes: Uint8Array }[]): string[] {
  return files.filter(({ bytes }) => holdsACarriageReturnAsText(bytes)).map(({ path }) => path);
}

function bytesOf(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

describe('the line endings of this repository', () => {
  test('.gitattributes holds the LF policy', () => {
    expect(readFileSync(join(REPOSITORY_ROOT, '.gitattributes'), 'utf8').split('\n')).toContain(LINE_ENDING_POLICY);
  });

  test('no repository text file holds a carriage return', () => {
    const filePaths = repositoryFilePaths(REPOSITORY_ROOT);
    expect(filePaths).toContain('setup.sh');
    expect(carriageReturnHoldersAmong(filePaths.map((path) => ({ path, bytes: readFileSync(join(REPOSITORY_ROOT, path)) })))).toEqual([]);
  });
});

describe('the carriage return scan, on planted bytes', () => {
  test('names a CRLF, a mixed and a lone carriage return file', () => {
    expect(carriageReturnHoldersAmong([
      { path: 'crlf.md', bytes: bytesOf('first\r\nsecond\r\n') },
      { path: 'mixed.md', bytes: bytesOf('first\r\nsecond\n') },
      { path: 'lone-carriage-return.md', bytes: bytesOf('first\rsecond\n') },
    ])).toEqual(['crlf.md', 'mixed.md', 'lone-carriage-return.md']);
  });

  test('passes an LF file, an empty file and a binary file whose bytes hold a carriage return', () => {
    expect(carriageReturnHoldersAmong([
      { path: 'plain.md', bytes: bytesOf('first\nsecond\n') },
      { path: 'empty.md', bytes: bytesOf('') },
      { path: 'picture.png', bytes: bytesOf('\u0000binary\r\nbytes') },
    ])).toEqual([]);
  });
});
