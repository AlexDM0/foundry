/**
 * Agent-written HTML, a ticket's body or an epic's description, reaches the DOM only as the `srcdoc` of this frame: without
 * `allow-scripts` nothing in it runs, `allow-same-origin` lets the parent size the frame to its content, and links open in a new tab.
 */
import { useEffect, useRef, useState } from 'react';

import { sandboxedHtmlDocumentOf } from './SandboxedHtmlDocument.ts';

export const SANDBOX_PERMISSIONS = 'allow-same-origin allow-popups allow-popups-to-escape-sandbox';

export type SandboxedHtmlPlacement = 'ticket-body' | 'epic-description';

export interface SandboxedHtmlFrameProps {
  readonly title:     string;
  readonly html:      string;
  readonly placement: SandboxedHtmlPlacement;
}

export function SandboxedHtmlFrame({ title, html, placement }: SandboxedHtmlFrameProps) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [contentHeight, setContentHeight] = useState<number | null>(null);
  const [loadCount, setLoadCount] = useState(0);

  useEffect(() => {
    const body = frame.current?.contentDocument?.body;
    if (body === undefined || body === null || typeof ResizeObserver === 'undefined') return undefined;
    const measure = (): void => setContentHeight(body.scrollHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(body);
    return () => observer.disconnect();
  }, [loadCount]);

  return (
    <iframe
      ref={frame}
      className={placement === 'ticket-body' ? 'bridge-ticket-body' : 'bridge-sandboxed-html'}
      title={title}
      sandbox={SANDBOX_PERMISSIONS}
      srcDoc={sandboxedHtmlDocumentOf(title, html)}
      style={contentHeight === null ? undefined : { height: `${contentHeight}px` }}
      onLoad={() => setLoadCount((count) => count + 1)}
    />
  );
}
