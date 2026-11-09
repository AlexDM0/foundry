/**
 * A ticket's rendered body, agent-written, reaches the DOM only as the `srcdoc` of this frame: without `allow-scripts` nothing in it runs,
 * `allow-same-origin` lets the panel size the frame to its content and lets the frame load the page's own stylesheets, and links open in a
 * new tab. The frame follows the page's theme, so the body reads in the panel's type and colours.
 */
import {
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';

import { DetailFactsModel, type BodyFrameSurroundings } from './DetailFactsModel.ts';

export const TICKET_BODY_SANDBOX = 'allow-same-origin allow-popups allow-popups-to-escape-sandbox';

const THEME_ATTRIBUTE = 'data-theme';

const DEFAULT_THEME = 'light';

export interface TicketBodyFrameProps {
  readonly title:    string;
  readonly bodyHtml: string;
}

function documentThemeOf(): string {
  return document.documentElement.getAttribute(THEME_ATTRIBUTE) ?? DEFAULT_THEME;
}

/** The page's theme, followed as the theme switch or the embedding parent changes it. */
function useDocumentTheme(): string {
  const [theme, setTheme] = useState(documentThemeOf);
  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(documentThemeOf()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: [THEME_ATTRIBUTE] });
    return () => observer.disconnect();
  }, []);
  return theme;
}

function pageStylesheetHrefsOf(): string[] {
  return [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].map((link) => link.href);
}

export function TicketBodyFrame({ title, bodyHtml }: TicketBodyFrameProps) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [contentHeight, setContentHeight] = useState<number | null>(null);
  const [loadCount, setLoadCount] = useState(0);
  const theme = useDocumentTheme();
  const [stylesheetHrefs] = useState(pageStylesheetHrefsOf);
  const sourceDocument = useMemo(() => {
    const surroundings: BodyFrameSurroundings = { stylesheetHrefs, theme };
    return DetailFactsModel.bodySourceDocumentOf(title, bodyHtml, surroundings);
  }, [title, bodyHtml, stylesheetHrefs, theme]);

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
      className="bridge-ticket-body"
      title={`Description of ${title}`}
      sandbox={TICKET_BODY_SANDBOX}
      srcDoc={sourceDocument}
      style={contentHeight === null ? undefined : { height: `${contentHeight}px` }}
      onLoad={() => setLoadCount((count) => count + 1)}
    />
  );
}
