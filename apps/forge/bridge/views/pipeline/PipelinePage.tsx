/**
 * The Focus layout of every pipeline page, a setup step's and a stage's that draws the flow alike: the page's main column beside its
 * 388px panel, over its full-width footer bar. In monorepo mode the level rail stands left of the main column. `ref` reaches the layout's
 * root.
 */
import type { ReactNode, Ref } from 'react';

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
  return (
    <div className="bridge-pipeline-focus" ref={ref}>
      <div className="bridge-pipeline-focus-body">
        {rail === null ? null : <div className="bridge-pipeline-focus-rail">{rail}</div>}
        <div className="bridge-pipeline-focus-main">{main}</div>
        <div className="bridge-pipeline-focus-aside">
          <div className="bridge-pipeline-focus-panel">{panel}</div>
        </div>
      </div>
      {footer === null ? null : <div className="bridge-pipeline-focus-footer">{footer}</div>}
    </div>
  );
}
