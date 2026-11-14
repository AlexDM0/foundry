/**
 * The 388px panel in the right column of every pipeline screen, as the Flow boards draw it: a head with the panel's name, its state as a
 * dot and a word, and an end such as the agent's model and effort, over the panel's tabs; under the head, the content that the caller
 * composes from the parts this file exports: a scrolling body, then a foot such as the composer.
 */
import { Row }            from 'design-system/Row';
import { Text }           from 'design-system/Text';
import type { ReactNode } from 'react';


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
      <span className="bridge-pipeline-panel-status-dot" data-tone={status.tone} aria-hidden="true" />
      <Text typeRole="tab" muted>{status.text}</Text>
    </Row>
  );
}

export function PipelinePanel({
  label, title, status = null, headEnd = null, tabs = null, tabPanelLabel, children
}: PipelinePanelProps) {
  return (
    <aside className="bridge-pipeline-panel" aria-label={label}>
      <div className="bridge-pipeline-panel-head" data-tabbed={tabs === null ? undefined : ''}>
        <Row between centerY gap="eight">
          <Row centerY gap="eight">
            <Text typeRole="title" element="h3">{title}</Text>
            {status === null ? null : <StatusMark status={status} />}
          </Row>
          {headEnd}
        </Row>
        {tabs}
      </div>
      <div className="bridge-pipeline-panel-content" role={tabPanelLabel === undefined ? undefined : 'tabpanel'} aria-label={tabPanelLabel}>
        {children}
      </div>
    </aside>
  );
}

/** The panel's scrolling body: its rows, its chat, its cards. */
export function PipelinePanelBody({ children }: { readonly children: ReactNode }) {
  return <div className="bridge-pipeline-panel-body">{children}</div>;
}

/** The panel's foot under a hairline: the composer, or the panel's one action. */
export function PipelinePanelFoot({ children }: { readonly children: ReactNode }) {
  return <div className="bridge-pipeline-panel-foot">{children}</div>;
}
