import { OperationRefusal } from '../src/shared/OperationRefusal.ts';

const BYTE_ORDER_MARK = '\uFEFF';
const NUL_CHARACTER = '\u0000';

type SuppliedEncoding = 'utf-8' | 'utf-16le' | 'utf-16be';

function encodingAndTextBytesOf(bytes: Buffer): { encoding: SuppliedEncoding; textBytes: Buffer } {
  const byteOrderMarks: readonly [SuppliedEncoding, Buffer][] = [
    ['utf-8', Buffer.from(BYTE_ORDER_MARK, 'utf8')],
    ['utf-16le', Buffer.from(BYTE_ORDER_MARK, 'utf16le')],
    ['utf-16be', Buffer.from(BYTE_ORDER_MARK, 'utf16le').swap16()],
  ];
  const found = byteOrderMarks.find(([, byteOrderMark]) => bytes.subarray(0, byteOrderMark.length).equals(byteOrderMark));
  if (found === undefined) return { encoding: 'utf-8', textBytes: bytes };
  return { encoding: found[0], textBytes: bytes.subarray(found[1].length) };
}

/**
 * The text of bytes a user supplied (a `--body-file`, standard input): UTF-8, or UTF-16 behind its byte order mark, as Windows PowerShell 5.1
 * writes by default; a byte order mark is not part of the text. Bytes that are not such text, or text holding a NUL, are refused, never
 * stored garbled. Nothing else changes: line endings stay as supplied.
 */
export function suppliedTextOf(bytes: Uint8Array, sourceName: string): string {
  const { encoding, textBytes } = encodingAndTextBytesOf(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
  let text: string;
  try {
    text = new TextDecoder(encoding, { fatal: true, ignoreBOM: true }).decode(textBytes);
  } catch {
    throw new OperationRefusal('refused', `${sourceName} is not valid ${encoding.toUpperCase()} text; save it as UTF-8 and supply it again.`);
  }
  if (text.includes(NUL_CHARACTER)) {
    throw new OperationRefusal(
      'refused',
      `${sourceName} holds a NUL character, so it is not text, or it is UTF-16 without a byte order mark; save it as UTF-8 and supply it again.`
    );
  }
  return text;
}
