/**
 * The Watcher reads its child's stdout through this one splitter. What matters: every line comes out whole and in order, however the
 * chunks cut it, a character cut between chunks included, with an unterminated tail last; and a long line arriving in many chunks is
 * searched only in its new text, since a search from the line's start each chunk stalls the Watcher's one thread on a large tool result.
 */
import { expect, spyOn, test } from 'bun:test';

import { forEachLine } from './StreamLines.ts';

async function* chunksOf(texts: readonly string[]): AsyncGenerator<Uint8Array> {
  const encoder = new TextEncoder();
  for (const text of texts) yield encoder.encode(text);
}

async function linesOf(chunks: AsyncIterable<Uint8Array>): Promise<string[]> {
  const lines: string[] = [];
  await forEachLine(chunks, (line) => lines.push(line));
  return lines;
}

test('lines come out whole and in order however the chunks cut them, an unterminated tail last', async () => {
  expect(await linesOf(chunksOf(['{"a":', '1}\n{"b"', ':2}\n\n{"c":3}\nunterminated', ' tail']))).toEqual(['{"a":1}', '{"b":2}', '', '{"c":3}', 'unterminated tail']);
  expect(await linesOf(chunksOf(['one\n', 'two\n']))).toEqual(['one', 'two']);
  expect(await linesOf(chunksOf([]))).toEqual([]);
});

test('a character whose bytes two chunks cut is decoded whole', async () => {
  const bytes = new TextEncoder().encode('Alex Example ✓\nnext\n');
  const cut = bytes.indexOf(0xe2) + 1;

  async function* cutChunks(): AsyncGenerator<Uint8Array> {
    yield bytes.slice(0, cut);
    yield bytes.slice(cut);
  }
  expect(await linesOf(cutChunks())).toEqual(['Alex Example ✓', 'next']);
});

test('a long line arriving in many chunks is searched only in its new text, so the work grows with its length, not its square', async () => {
  const CHUNK_CHARACTERS = 1024;
  const CHUNK_COUNT = 200;
  const chunks = [...Array.from({ length: CHUNK_COUNT }, () => 'x'.repeat(CHUNK_CHARACTERS)), '\n'];
  const realIndexOf = String.prototype.indexOf;
  let searchedCharacters = 0;
  const countedSearches = spyOn(String.prototype, 'indexOf').mockImplementation(function countedIndexOf(this: string, search: string, position?: number) {
    if (search === '\n') searchedCharacters += this.length - (position ?? 0);
    return realIndexOf.call(this, search, position);
  });
  let lines: string[] = [];
  try {
    lines = await linesOf(chunksOf(chunks));
  } finally {
    countedSearches.mockRestore();
  }
  expect(lines).toEqual(['x'.repeat(CHUNK_CHARACTERS * CHUNK_COUNT)]);
  expect(searchedCharacters).toBeLessThanOrEqual((CHUNK_CHARACTERS * CHUNK_COUNT) + 1);
});
