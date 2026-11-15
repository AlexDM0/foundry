import { writeSync } from 'node:fs';

/**
 * One `write` may store fewer bytes than it was given, with no error, as when the disk fills partway; this writes again from where the
 * last one stopped until every byte is stored, and throws when a write stores nothing, so a cut-short file is never taken as whole.
 */
export function writeEveryByte(fileDescriptor: number, contents: string | Uint8Array): void {
  const bytes = typeof contents === 'string' ? Buffer.from(contents) : contents;
  let writtenByteCount = 0;
  while (writtenByteCount < bytes.byteLength) {
    const storedByteCount = writeSync(fileDescriptor, bytes, writtenByteCount, bytes.byteLength - writtenByteCount);
    if (storedByteCount <= 0) {
      throw Object.assign(new Error(`EIO: a write stored no byte, ${writtenByteCount} of ${bytes.byteLength} written`), { code: 'EIO' });
    }
    writtenByteCount += storedByteCount;
  }
}
