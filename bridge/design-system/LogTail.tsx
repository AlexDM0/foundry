/**
 * The last lines of a running command's output, mono on the log surface: a command line led by `$`, an output line indented. While `live`
 * it follows new lines to the bottom, unless the reader scrolled up; scrolling back to the bottom follows again. It is not a live region: a
 * screen reader would be flooded.
 */
import { useLayoutEffect, useRef } from 'react';

export interface LogTailLine {
  readonly key:  string;
  readonly text: string;
  readonly kind: 'command' | 'output';
}

export interface LogTailProps {
  readonly label: string;
  readonly lines: readonly LogTailLine[];
  readonly live:  boolean;
}

/** How close to the bottom, in pixels, still counts as at the bottom: a fractional scroll position never lands exactly on it. */
const AT_BOTTOM_TOLERANCE_PIXELS = 2;

function isAtBottom(element: HTMLElement): boolean {
  return element.scrollHeight - element.clientHeight - element.scrollTop <= AT_BOTTOM_TOLERANCE_PIXELS;
}

export function LogTail({ label, lines, live }: LogTailProps) {
  const tail = useRef<HTMLOListElement>(null);
  const followsTheEnd = useRef(true);
  useLayoutEffect(() => {
    const element = tail.current;
    if (element !== null && live && followsTheEnd.current) element.scrollTop = element.scrollHeight;
  }, [lines, live]);
  return (
    <ol
      ref={tail}
      className="bridge-log-tail"
      aria-label={label}
      // A scrolling list takes the focus, so a keyboard reader can scroll it.
      tabIndex={0}
      onScroll={(event) => {
        followsTheEnd.current = isAtBottom(event.currentTarget);
      }}
    >
      {lines.map((line) => <li key={line.key} className="bridge-log-tail-line" data-kind={line.kind}>{line.text}</li>)}
    </ol>
  );
}
