/**
 * One box of a flow: a title with an optional tag inline after it, an optional meter at the head's end, a detail line, a row of chips, and
 * an end slot for a control such as a switch. A node with `onOpen` takes the focus and opens on a double-click or Enter; a click, key or
 * double-click inside the end slot stays there. A node without `onOpen` takes no focus, while a focusable meter inside it still does.
 * Selected and marked nodes are drawn with rings, so the border never changes width.
 */
import {
  useId,
  type KeyboardEvent,
  type ReactNode,
  type SyntheticEvent
} from 'react';

export type FlowNodeVariant = 'step' | 'group' | 'switch' | 'outcome' | 'target';

export type FlowNodeMark = 'proposed' | 'changed' | 'new' | 'removed';

export interface FlowNodeTag {
  readonly text:    string;
  readonly variant: 'conditional';
}

export interface FlowNodeProps {
  readonly title:        string;
  readonly tag?:         FlowNodeTag;
  readonly detail?:      ReactNode;
  readonly meter?:       ReactNode;
  readonly chips?:       ReactNode;
  /** A control of its own, such as a `Switch`: what happens in it never opens the node. */
  readonly end?:         ReactNode;
  readonly variant:      FlowNodeVariant;
  readonly conditional?: boolean;
  readonly mark?:        FlowNodeMark;
  readonly selected?:    boolean;
  /** `highlight` draws the node in the human review colours. */
  readonly tone?:        'highlight';
  /** Opens the node's dialog. Without it the node is not focusable and announces no popup. */
  readonly onOpen?:      () => void;
  /** The node's accessible name while it opens a dialog, such as "Open the Builder step"; the title names it otherwise. */
  readonly openLabel?:   string;
}

function keepInsideEnd(event: SyntheticEvent): void {
  event.stopPropagation();
}

export function FlowNode({
  title, tag, detail, meter, chips, end, variant, conditional = false, mark, selected = false, tone, onOpen, openLabel
}: FlowNodeProps) {
  const titleElementId = useId();
  const opens = onOpen !== undefined;

  const openOnKey = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (onOpen === undefined || event.key !== 'Enter' || event.target !== event.currentTarget) return;
    event.preventDefault();
    onOpen();
  };

  return (
    <div
      className="bridge-flow-node"
      role="group"
      aria-label={opens ? openLabel : undefined}
      aria-labelledby={opens && openLabel !== undefined ? undefined : titleElementId}
      aria-haspopup={opens ? 'dialog' : undefined}
      tabIndex={opens ? 0 : undefined}
      data-variant={variant}
      data-mark={mark}
      data-conditional={conditional ? '' : undefined}
      data-selected={selected ? '' : undefined}
      data-tone={tone}
      onDoubleClick={onOpen}
      onKeyDown={openOnKey}
    >
      <span className="bridge-flow-node-head">
        <span className="bridge-flow-node-title" id={titleElementId}>{title}</span>
        {tag === undefined ? null : <span className="bridge-flow-node-tag" data-variant={tag.variant}>{tag.text}</span>}
        {meter === undefined ? null : <span className="bridge-flow-node-meter">{meter}</span>}
      </span>
      {detail === undefined ? null : <span className="bridge-flow-node-detail">{detail}</span>}
      {chips === undefined ? null : <span className="bridge-flow-node-chips">{chips}</span>}
      {end === undefined
        ? null
        : (
          <span className="bridge-flow-node-end" onClick={keepInsideEnd} onDoubleClick={keepInsideEnd} onKeyDown={keepInsideEnd}>
            {end}
          </span>
        )}
    </div>
  );
}
