/**
 * The verdicts one epic file reads as. The case that matters is a file that is not UTF-8: a lossy decode would read U+FFFD in place of its
 * bytes, and the next write would lose them, so it is malformed at line 0 and never parsed.
 */
import { writeFileSync } from 'node:fs';
import { join }          from 'node:path';

import { afterAll, expect, test } from 'bun:test';

import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { EpicFileIngestion }                              from './EpicFileIngestion.ts';

const EPIC_DOCUMENT = ['---', 'key: "search"', 'title: "Search"', 'slot: 1', '---', 'Body.', ''].join('\n');

const scratchDirectories: string[] = [];

afterAll(() => {
  for (const directory of scratchDirectories) removeScratchDirectory(directory);
});

function epicFileHolding(bytes: Uint8Array): string {
  const directory = createScratchDirectory('epic-ingestion');
  scratchDirectories.push(directory);
  const epicPath = join(directory, 'search.md');
  writeFileSync(epicPath, bytes);
  return epicPath;
}

test('an epic file parses into the epic, which carries no location', () => {
  const epicPath = epicFileHolding(Buffer.from(EPIC_DOCUMENT));
  const reading  = new EpicFileIngestion(epicPath).read();
  expect(reading.verdict === 'parsed' ? Object.keys(reading.epic).sort() : null).toEqual(['body', 'frontmatter', 'lineEnding']);
});

test('a file that is not UTF-8, such as one saved in cp1252, is malformed at line 0', () => {
  const epicPath = epicFileHolding(Buffer.concat([Buffer.from(EPIC_DOCUMENT), Buffer.from([0x63, 0x61, 0x66, 0xE9, 0x0A])]));
  expect(new EpicFileIngestion(epicPath).read()).toEqual({ verdict: 'malformed', reason: 'the file is not UTF-8 text', line: 0 });
});
