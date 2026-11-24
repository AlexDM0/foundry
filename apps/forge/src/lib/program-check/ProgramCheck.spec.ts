/**
 * The reading of a checked program's output, on streams built here, since a default spec starts no program. What matters: output under
 * the limit is kept whole, output past it is cut at the limit yet read to its end, so a program that floods its pipe never blocks, and a
 * character cut in two reads as a replacement, never a throw.
 */
import { describe, expect, test } from 'bun:test';

import { cappedTextOf } from './ProgramCheck.ts';

function streamOf(chunks: readonly Uint8Array[]): { stream: ReadableStream<Uint8Array>; chunksRead: () => number } {
  let read = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      const chunk = chunks[read];
      if (chunk === undefined) {
        controller.close();
        return;
      }
      read += 1;
      controller.enqueue(chunk);
    },
  });
  return { stream, chunksRead: () => read };
}

const encoded = (text: string): Uint8Array => new TextEncoder().encode(text);

describe('cappedTextOf', () => {
  test('keeps output under the limit whole', async () => {
    expect(await cappedTextOf(streamOf([encoded('example-agent '), encoded('2.1.0\n')]).stream, 1024)).toBe('example-agent 2.1.0\n');
  });

  test('cuts output past the limit at the limit and still reads every chunk to the end', async () => {
    const flood = streamOf([encoded('abcd'), encoded('efgh'), encoded('ijkl'), encoded('mnop')]);
    expect(await cappedTextOf(flood.stream, 6)).toBe('abcdef');
    expect(flood.chunksRead()).toBe(4);
  });

  test('a character the limit cuts in two reads as a replacement character', async () => {
    expect(await cappedTextOf(streamOf([encoded('aé')]).stream, 2)).toBe('a�');
  });
});
