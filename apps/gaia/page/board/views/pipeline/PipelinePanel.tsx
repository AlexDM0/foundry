/**
 * The 388px panel in the right column of every pipeline screen, as the Flow boards draw it: a head with the panel's name, its state as a
 * dot and a word, and an end such as the agent's model and effort, over the panel's tabs; under the head, the content that the caller
 * composes from the parts this file exports: a scrolling body, then a foot such as the composer.
 */
import {
  useEffect,
  useRef,
  type ReactNode,
  type RefObject
} from 'react';
import { Row, Text } from '../../../lib/design-system/DesignSystemInterface.ts';

/** How near the end a reader may scroll and still be taken along to new lines. */
const FOLLOWED_END_SLACK_PIXELS = 24;


/** `working` pulses in the signal colour, `ready` is the merge green, `idle` the quiet grey. */
export type PanelStatusTone = 'working' | 'ready' | 'idle';

/** The state the panel's head shows beside its name: "Researching", "Proposal ready", "Not started". */
export interface PanelStatus {
  readonly tone: PanelStatusTone;
  readonly text: string;
}

export interface PipelinePanelProps {
  /** The panel's accessible name. */
  readonly label:          string;
  readonly title:          string;
  readonly status?:        PanelStatus | null;
  /** The right end of the head's first line, such as the agent's model and effort. */
  readonly headEnd?:       ReactNode;
  /** The panel's tabs, under the name. */
  readonly tabs?:          ReactNode;
  /** With tabs, the accessible name of the selected tab's panel. */
  readonly tabPanelLabel?: string;
  readonly children:       ReactNode;
}

function StatusMark({ status }: { readonly status: PanelStatus }) {
  return (
    <Row centerY gap="eight">
      <span className="board-pipeline-panel-status-dot" data-tone={status.tone} aria-hidden="true" />
      <Text typeRole="tab" muted>{status.text}</Text>
    </Row>
  );
}

export function PipelinePanel({
  label, title, status = null, headEnd = null, tabs = null, tabPanelLabel, children
}: PipelinePanelProps) {
  return (
    <aside className="board-pipeline-panel" aria-label={label}>
      <div className="board-pipeline-panel-head" data-tabbed={tabs === null ? undefined : ''}>
        <Row between centerY gap="eight">
          <Row centerY gap="eight">
            <Text typeRole="title" element="h3">{title}</Text>
            {status === null ? null : <StatusMark status={status} />}
          </Row>
          {headEnd}
        </Row>
        {tabs}
      </div>
      <div className="board-pipeline-panel-content" role={tabPanelLabel === undefined ? undefined : 'tabpanel'} aria-label={tabPanelLabel}>
        {children}
      </div>
    </aside>
  );
}

/**
 * Keeps a followed body scrolled to its end as its content grows, as a chat shows its newest line, while the reader stays at the end; a
 * reader who scrolled up keeps their place.
 */
function useFollowedEnd(bodyRef: RefObject<HTMLDivElement | null>, followsEnd: boolean): void {
  useEffect(() => {
    const body = bodyRef.current;
    if (!followsEnd || body === null) return undefined;
    let readerIsAtEnd = true;
    let endScrolledTo = 0;
    // A scroll event arrives a frame late, after more lines may have grown the body: at or past the end this hook scrolled to is the end.
    const noteReaderPlace = (): void => {
      readerIsAtEnd = body.scrollTop >= endScrolledTo
        || body.scrollHeight - body.scrollTop - body.clientHeight <= FOLLOWED_END_SLACK_PIXELS;
    };
    const keepEndInView = (): void => {
      if (!readerIsAtEnd) return;
      body.scrollTop = body.scrollHeight;
      endScrolledTo = body.scrollTop;
    };
    keepEndInView();
    const contentWatcher = new MutationObserver(keepEndInView);
    contentWatcher.observe(body, { childList: true, subtree: true, characterData: true });
    body.addEventListener('scroll', noteReaderPlace);
    return () => {
      contentWatcher.disconnect();
      body.removeEventListener('scroll', noteReaderPlace);
    };
  }, [bodyRef, followsEnd]);
}

export interface PipelinePanelBodyProps {
  /** A chat's body opens at its end and follows new lines while the reader is there. */
  readonly followsEnd?: boolean;
  readonly children:    ReactNode;
}

/** The panel's scrolling body: its rows, its chat, its cards. */
export function PipelinePanelBody({ followsEnd = false, children }: PipelinePanelBodyProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  useFollowedEnd(bodyRef, followsEnd);
  return <div ref={bodyRef} className="board-pipeline-panel-body">{children}</div>;
}

/** The panel's foot under a hairline: the composer, or the panel's one action. */
export function PipelinePanelFoot({ children }: { readonly children: ReactNode }) {
  return <div className="board-pipeline-panel-foot">{children}</div>;
}
