/**
 * The Focus layout of every pipeline page, a setup step's and a stage's that draws the flow alike: the page's main column beside its
 * panel, at least 388px wide and widened by dragging its left edge, over its full-width footer bar. In monorepo mode the level rail stands
 * left of the main column. `ref` reaches the layout's root.
 */
import type { CSSProperties, ReactNode, Ref } from 'react';

import { PANEL_LEAST_WIDTH_PIXELS, useResizablePanelWidth } from './UseResizablePanelWidth.ts';

export interface PipelinePageProps {
  readonly main:   ReactNode;
  readonly panel:  ReactNode;
  readonly footer: ReactNode;
  readonly ref?:   Ref<HTMLDivElement>;
  /** The level rail of monorepo mode; single mode has none. */
  readonly rail?:  ReactNode;
}

export function PipelinePage({
  main, panel, footer, ref, rail = null
}: PipelinePageProps) {
  const resizablePanel = useResizablePanelWidth();
  const panelWidthStyle = { '--board-pipeline-panel-width': `${resizablePanel.panelWidth}px` } as CSSProperties;
  return (
    <div className="board-pipeline-focus" ref={ref}>
      <div className="board-pipeline-focus-body">
        {rail === null ? null : <div className="board-pipeline-focus-rail">{rail}</div>}
        <div className="board-pipeline-focus-main">{main}</div>
        <div className="board-pipeline-focus-aside" style={panelWidthStyle}>
          <div
            className="board-pipeline-focus-resize-handle"
            role="separator"
            aria-orientation="vertical"
            aria-label="Panel width"
            aria-valuemin={PANEL_LEAST_WIDTH_PIXELS}
            aria-valuenow={resizablePanel.panelWidth}
            tabIndex={0}
            onPointerDown={resizablePanel.onPointerDown}
            onPointerMove={resizablePanel.onPointerMove}
            onPointerUp={resizablePanel.onPointerUp}
            onPointerCancel={resizablePanel.onPointerUp}
            onKeyDown={resizablePanel.onKeyDown}
          />
          <div className="board-pipeline-focus-panel">{panel}</div>
        </div>
      </div>
      {footer === null ? null : <div className="board-pipeline-focus-footer">{footer}</div>}
    </div>
  );
}
