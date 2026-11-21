/**
 * A body read to a bound. What matters: a body at the bound is read whole; a declared length over it is refused without a byte read; a body
 * that declares no length and runs past the bound is refused once it does, its stream cancelled; and an absent body reads as empty.
 */
import { describe, expect, test } from 'bun:test';

import { BoundedBody } from './BoundedBody.ts';

const BOUND_BYTES = 16;

function requestWithBody(body: string | null): Request {
  return new Request('http://127.0.0.1:4790/api/v1/commands', { method: 'POST', body });
}

/** A body sent in chunks with no declared length, which counts the chunks the reader pulled and whether it was cancelled. */
function chunkedBody(chunks: readonly string[]): { readonly body: ReadableStream<Uint8Array>; readonly pulledChunks: () => number; readonly wasCancelled: () => boolean } {
  const encoder = new TextEncoder();
  let pulled = 0;
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      const chunk = chunks[pulled];
      pulled += 1;
      if (chunk === undefined) controller.close();
      else controller.enqueue(encoder.encode(chunk));
    },
    cancel() {
      cancelled = true;
    },
  });
  return { body, pulledChunks: () => pulled, wasCancelled: () => cancelled };
}

describe('a body read to a bound', () => {
  test('is read whole at the bound, as text too', async () => {
    const text = 'x'.repeat(BOUND_BYTES);
    const reading = await BoundedBody.boundedBodyOf(requestWithBody(text), BOUND_BYTES);
    expect(reading.verdict === 'read' ? reading.bytes.length : null).toBe(BOUND_BYTES);
    expect(await BoundedBody.boundedTextOf(requestWithBody(text), BOUND_BYTES)).toEqual({ verdict: 'read', text });
  });

  test('is refused by its declared length without being read', async () => {
    const headers = { 'content-length': String(BOUND_BYTES + 1) };
    const request = new Request('http://127.0.0.1:4790/api/v1/commands', { method: 'POST', body: 'x'.repeat(BOUND_BYTES + 1), headers });
    expect(await BoundedBody.boundedBodyOf(request, BOUND_BYTES)).toEqual({ verdict: 'too-large' });
    expect(request.bodyUsed).toBe(false);
  });

  test('stops reading a body that declares no length once it runs past the bound, and cancels it', async () => {
    const chunked = chunkedBody(['x'.repeat(10), 'x'.repeat(10), 'x'.repeat(10), 'x'.repeat(10)]);
    const request = new Request('http://127.0.0.1:4790/api/v1/pictures', { method: 'POST', body: chunked.body, duplex: 'half' } as RequestInit);
    expect(await BoundedBody.boundedBodyOf(request, BOUND_BYTES)).toEqual({ verdict: 'too-large' });
    expect(chunked.wasCancelled()).toBe(true);
    expect(chunked.pulledChunks()).toBeLessThan(4);
  });

  test('reads an absent body as empty', async () => {
    const reading = await BoundedBody.boundedBodyOf(new Request('http://127.0.0.1:4790/api/v1/commands', { method: 'POST' }), BOUND_BYTES);
    expect(reading.verdict === 'read' ? reading.bytes.length : null).toBe(0);
  });
});
