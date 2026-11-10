/**
 * The picture upload's body read, on requests built in memory: no server listens. What matters: a declared length over the limit is
 * refused before one byte is read, and a body with no declared length stops being read once it runs past the limit, so an oversized upload
 * never costs its whole size in memory; a body within the limit is read whole, its chunks in order.
 */
import { describe, expect, test } from 'bun:test';

import { OverseerServer } from './OverseerServer.ts';

const EXAMPLE_UPLOAD_URL = 'http://127.0.0.1:4100/api/pictures';
const SIZE_LIMIT_BYTES = 8;

/** A streamed body of the chunks, counting how many the reader pulled. */
function countingBodyOf(chunks: readonly number[][]): { body: ReadableStream<Uint8Array>; pulledChunks: () => number } {
  let pulled = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      const chunk = chunks[pulled];
      if (chunk === undefined) {
        controller.close();
        return;
      }
      pulled += 1;
      controller.enqueue(Uint8Array.from(chunk));
    },
  }, { highWaterMark: 0 });
  return { body, pulledChunks: () => pulled };
}

describe('the picture upload body', () => {
  test('a declared length over the limit is refused with that length, and nothing of the body is read', async () => {
    const { body, pulledChunks } = countingBodyOf([[1, 2, 3, 4, 5, 6, 7, 8, 9]]);
    const request = new Request(EXAMPLE_UPLOAD_URL, { method: 'POST', headers: { 'content-length': '9' }, body });
    expect(await OverseerServer.pictureUploadOf(request, SIZE_LIMIT_BYTES)).toEqual({ verdict: 'over-limit', bytes: 9 });
    expect(pulledChunks()).toBe(0);
  });

  test('a body with no declared length stops being read at the chunk that runs past the limit', async () => {
    const { body, pulledChunks } = countingBodyOf([[1, 2, 3, 4, 5], [6, 7, 8, 9, 10], [11, 12, 13, 14, 15]]);
    const request = new Request(EXAMPLE_UPLOAD_URL, { method: 'POST', body });
    expect(await OverseerServer.pictureUploadOf(request, SIZE_LIMIT_BYTES)).toEqual({ verdict: 'over-limit', bytes: 10 });
    expect(pulledChunks()).toBe(2);
  });

  test('a body within the limit is read whole, its chunks in order', async () => {
    const { body } = countingBodyOf([[1, 2, 3], [4, 5, 6, 7, 8]]);
    const request = new Request(EXAMPLE_UPLOAD_URL, { method: 'POST', body });
    const upload = await OverseerServer.pictureUploadOf(request, SIZE_LIMIT_BYTES);
    expect(upload.verdict).toBe('read');
    expect(upload.verdict === 'read' ? [...upload.bytes] : []).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});
