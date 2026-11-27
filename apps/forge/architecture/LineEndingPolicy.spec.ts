/**
 * The line-ending policy, the part that runs no git: `.gitattributes` holds every text file at LF, since a carriage return breaks `setup.sh`,
 * the hooks, the prose wrap and the frozen tables, and no file of the program or its packages holds one; a NUL byte marks a file binary.
 * `src/lib/git/LineEndingPolicy.integration.spec.ts` holds what git itself answers.
 */
import { readFileSync } from 'node:fs';
import { join }         from 'node:path';

import { describe, expect, test } from 'bun:test';

import { repositoryRootOfThisCheckout }         from '../src/testing/ImportGraph.ts';
import { programFiles, workspaceRootOfProgram } from '../src/testing/RepositorySources.ts';

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
    expect(readFileSync(join(workspaceRootOfProgram(REPOSITORY_ROOT), '.gitattributes'), 'utf8').split('\n')).toContain(LINE_ENDING_POLICY);
  });

  test('no repository text file holds a carriage return', () => {
    const files = programFiles(REPOSITORY_ROOT);
    expect(files.map(({ path }) => path)).toEqual(expect.arrayContaining(['setup.sh', 'forge-contracts/package.json', 'system-versions/package.json']));
    expect(carriageReturnHoldersAmong(files.map(({ path, location }) => ({ path, bytes: readFileSync(location) })))).toEqual([]);
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
