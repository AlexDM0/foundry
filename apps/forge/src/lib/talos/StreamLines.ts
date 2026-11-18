const LINE_SEPARATOR = '\n';

/**
 * Each complete line of the stream as it arrives, then an unterminated tail as the last line. Only the newly decoded text is searched,
 * and an unterminated line is kept in parts joined once, so a line arriving in many chunks costs time in its length, not its square.
 */
export async function forEachLine(stream: AsyncIterable<Uint8Array>, consumeLine: (line: string) => void): Promise<void> {
  const decoder = new TextDecoder();
  const unterminatedParts: string[] = [];
  for await (const chunk of stream) {
    const text = decoder.decode(chunk, { stream: true });
    let lineStart = 0;
    let separatorIndex = text.indexOf(LINE_SEPARATOR);
    while (separatorIndex !== -1) {
      unterminatedParts.push(text.slice(lineStart, separatorIndex));
      consumeLine(unterminatedParts.join(''));
      unterminatedParts.length = 0;
      lineStart = separatorIndex + 1;
      separatorIndex = text.indexOf(LINE_SEPARATOR, lineStart);
    }
    if (lineStart < text.length) unterminatedParts.push(text.slice(lineStart));
  }
  unterminatedParts.push(decoder.decode());
  const tail = unterminatedParts.join('');
  if (tail.length > 0) consumeLine(tail);
}
