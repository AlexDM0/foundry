/**
 * An epic file read and written back. The cases that matter: the description survives byte for byte, a `---` line in it included; a
 * hand-written line the CLI does not own survives a rewrite; a CRLF file stays CRLF; and every file the CLI cannot understand is a
 * verdict naming the line, never a throw.
 */
import { expect, test } from 'bun:test';

import { EpicFileProblemWording } from '../EpicFileProblemWording.ts';
import { EpicDocumentUtil }       from './EpicDocumentUtil.ts';

const { epicDocumentTextOf, parsedEpicDocumentOf } = EpicDocumentUtil;

/** The parse with a malformed verdict's problem worded as the epic listing prints it. */
function wordedParsingOf(text: string): ReturnType<typeof parsedEpicDocumentOf> | { verdict: 'malformed'; reason: string; line: number } {
  const parsed = parsedEpicDocumentOf(text);
  return parsed.verdict === 'malformed' ? { verdict: 'malformed', reason: EpicFileProblemWording.sentenceOf(parsed.problem), line: parsed.line } : parsed;
}

const WRITTEN_EPIC = '---\nkey: "checkout-redesign"\ntitle: "Checkout redesign"\nslot: 2\n---\nThe checkout, rebuilt.\n\n---\n\nAfter a rule.\n';

test('a written epic reads back and writes back byte for byte, its description holding a rule', () => {
  const parsed = parsedEpicDocumentOf(WRITTEN_EPIC);
  if (parsed.verdict !== 'parsed') throw new Error(EpicFileProblemWording.sentenceOf(parsed.problem));

  expect(parsed.frontmatter).toEqual({
    key: 'checkout-redesign', title: 'Checkout redesign', slot: 2, extra: []
  });
  expect(parsed.body).toBe('The checkout, rebuilt.\n\n---\n\nAfter a rule.\n');
  expect(epicDocumentTextOf(parsed.frontmatter, parsed.body, parsed.lineEnding)).toBe(WRITTEN_EPIC);
});

test('unquoted values read as text, and an unknown key, a comment and a blank line survive a rewrite in CRLF', () => {
  const handWritten = ['---', 'key: search', 'owner: Alex Example', '# kept by hand', '', 'title: Search', 'slot: 1', '---', 'Body.', ''].join('\r\n');
  const parsed      = parsedEpicDocumentOf(handWritten);
  if (parsed.verdict !== 'parsed') throw new Error(EpicFileProblemWording.sentenceOf(parsed.problem));

  expect(parsed.frontmatter.extra).toEqual([['owner', 'Alex Example'], ['#', 'kept by hand'], ['', '']]);
  expect(epicDocumentTextOf(parsed.frontmatter, parsed.body, parsed.lineEnding))
    .toBe(['---', 'key: "search"', 'title: "Search"', 'slot: 1', 'owner: Alex Example', '# kept by hand', '', '---', 'Body.', ''].join('\r\n'));
});

test('a leading byte order mark a Windows editor wrote is skipped, and the epic reads as the same file without it', () => {
  const parsed = parsedEpicDocumentOf(`\uFEFF${WRITTEN_EPIC}`);
  if (parsed.verdict !== 'parsed') throw new Error(EpicFileProblemWording.sentenceOf(parsed.problem));

  expect(epicDocumentTextOf(parsed.frontmatter, parsed.body, parsed.lineEnding)).toBe(WRITTEN_EPIC);
});

test('a file the CLI cannot understand is a verdict with its problem and line', () => {
  expect(wordedParsingOf('key: "search"\n')).toEqual({ verdict: 'malformed', reason: 'the first line must be the frontmatter fence `---`', line: 1 });
  expect(wordedParsingOf('---\nkey: "search"\n')).toMatchObject({ verdict: 'malformed', reason: 'the frontmatter has no closing `---` fence' });
  expect(wordedParsingOf('---\nkey: "search"\nslot: 1\n---\n')).toEqual({ verdict: 'malformed', reason: 'the frontmatter has no `title` key', line: 4 });
  expect(wordedParsingOf('---\nkey: "Search"\ntitle: x\nslot: 1\n---\n')).toEqual({ verdict: 'malformed', reason: '`key` is not an epic key: Search', line: 2 });
  expect(wordedParsingOf('---\nkey: search\ntitle: x\nslot: 7\n---\n')).toEqual({ verdict: 'malformed', reason: '`slot` is not a colour slot from 1 to 6: 7', line: 4 });
  expect(wordedParsingOf('---\nkey: search\nnot a line\n---\n')).toEqual({ verdict: 'malformed', reason: '`not a line` is not a `key: value` line', line: 3 });
  expect(wordedParsingOf('---\nkey: "search\ntitle: x\nslot: 1\n---\n')).toMatchObject({ verdict: 'malformed', line: 2 });
});
