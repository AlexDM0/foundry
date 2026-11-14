/**
 * An ordered list of lines, each led by a mono key in a column of its own: a time (`stamp`) or a tool name (`tool`, a wider column). A line
 * marked `current` draws its key in the warn ink, bold; a line marked `alert` leads its text with an error dot and sets it bold.
 */
import type { ReactNode } from 'react';

export type KeyedLineMark = 'current' | 'alert';

export interface KeyedLine {
  readonly key:       string;
  /** The key's full form on hover, such as the full stamp behind a short time. */
  readonly keyTitle?: string;
  readonly text:      ReactNode;
  readonly mark?:     KeyedLineMark;
}

export interface KeyedLineListProps {
  readonly label:     string;
  readonly keyColumn: 'stamp' | 'tool';
  readonly lines:     readonly KeyedLine[];
}

export function KeyedLineList({ label, keyColumn, lines }: KeyedLineListProps) {
  return (
    <ol className="design-system-keyed-lines" aria-label={label} data-key-column={keyColumn}>
      {/* Two lines may share a key, such as two calls of one tool, so a line is known by its place. */}
      {lines.map((line, i) => (
        <li key={i} className="design-system-keyed-line" data-mark={line.mark}>
          <span className="design-system-keyed-line-key" title={line.keyTitle}>{line.key}</span>
          <span className="design-system-keyed-line-text">{line.text}</span>
        </li>
      ))}
    </ol>
  );
}
