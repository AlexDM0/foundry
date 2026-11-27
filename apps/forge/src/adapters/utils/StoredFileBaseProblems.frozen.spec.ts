/** What User reads of a stored file every format refuses alike never changes: each frozen case reads back as today's sentence (package 3). */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join }                                   from 'node:path';
import { expect, test }                           from 'bun:test';

import { createScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import FROZEN_PROBLEMS            from './FrozenStoredFileBaseProblems.json';
import { StoredJsonDocumentUtil } from './StoredJsonDocumentUtil.ts';

const NOT_UTF8_CASE = 'the bytes are not UTF-8';

function systemErrorOf(filePath: string): string {
  try {
    readFileSync(filePath);
    return '';
  } catch (error) {
    return error instanceof Error ? error.message : '';
  }
}

for (const { case: problemCase, stored, sentence } of FROZEN_PROBLEMS) {
  test(`${problemCase}: ${sentence}`, () => {
    const filePath = join(createScratchDirectory('frozen-stored-file-base'), 'stored.json');
    if (stored !== null) writeFileSync(filePath, stored);
    else if (problemCase === NOT_UTF8_CASE) writeFileSync(filePath, Uint8Array.of(0x7b, 0xff, 0xfe, 0x7d));
    else mkdirSync(filePath);
    expect(StoredJsonDocumentUtil.documentAt(filePath, 1)).toEqual({ verdict: 'unreadable', reason: sentence.replace('{systemError}', systemErrorOf(filePath)) });
  });
}
