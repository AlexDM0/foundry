/**
 * A request's body read to a bound, since a server's own body limit is one for all its routes: a declared length over the bound is not read
 * at all, and a body that runs past it stops being read there, so no memory goes to it.
 */
export type BoundedBodyReading =
  | { readonly verdict: 'read'; readonly bytes: Uint8Array }
  | { readonly verdict: 'too-large' };

const CONTENT_LENGTH_HEADER = 'content-length';

function declaredLengthIsOverBound(request: Request, maximumBytes: number): boolean {
  const declaredLength = request.headers.get(CONTENT_LENGTH_HEADER);
  return declaredLength !== null && Number(declaredLength) > maximumBytes;
}

function joinedBytesOf(chunks: readonly Uint8Array[], totalBytes: number): Uint8Array {
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

async function boundedBodyOf(request: Request, maximumBytes: number): Promise<BoundedBodyReading> {
  if (declaredLengthIsOverBound(request, maximumBytes)) return { verdict: 'too-large' };
  if (request.body === null) return { verdict: 'read', bytes: new Uint8Array() };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let readBytes = 0;
  for (let read = await reader.read(); !read.done; read = await reader.read()) {
    readBytes += read.value.length;
    if (readBytes > maximumBytes) {
      await reader.cancel();
      return { verdict: 'too-large' };
    }
    chunks.push(read.value);
  }
  return { verdict: 'read', bytes: joinedBytesOf(chunks, readBytes) };
}

/** The body as UTF-8 text, read to the bound as `boundedBodyOf` reads it. */
async function boundedTextOf(request: Request, maximumBytes: number): Promise<{ readonly verdict: 'read'; readonly text: string } | { readonly verdict: 'too-large' }> {
  const reading = await boundedBodyOf(request, maximumBytes);
  return reading.verdict === 'read' ? { verdict: 'read', text: new TextDecoder().decode(reading.bytes) } : reading;
}

export const BoundedBody = {
  boundedBodyOf,
  boundedTextOf,
} as const;
