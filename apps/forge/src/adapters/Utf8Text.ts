/**
 * A stored file's bytes as text, or `null` when they are not UTF-8: a lossy decode would put U+FFFD in their place, and the next write would
 * lose the bytes for good. A leading byte order mark stays part of the text, so a write of the text back is byte identical.
 */
export function utf8TextOf(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    return null;
  }
}
