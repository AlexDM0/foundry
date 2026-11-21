/**
 * The layout the pipeline agent reports first in monorepo mode: each stand-alone codebase's folder in mono with what it is, the files the
 * report came from, and that User confirms the entities in the next step. It runs nothing and proposes nothing.
 */
import { MonoId, Text } from '../../../../lib/design-system/DesignSystemInterface.ts';

import { FlowGlyph }       from '../flow/FlowGlyph.tsx';
import type { LayoutItem } from './ResearchStepModel.ts';

export interface LayoutFindingProps {
  readonly items:       readonly LayoutItem[];
  readonly sourcePaths: readonly string[];
}

export function LayoutFinding({ items, sourcePaths }: LayoutFindingProps) {
  return (
    <section className="board-pipeline-research-layout" aria-label="Layout">
      <h3 className="board-pipeline-research-card-head">
        <span className="board-pipeline-research-check"><FlowGlyph glyph="check" /></span>
        <span className="board-pipeline-research-card-title">Layout</span>
        <span className="board-pipeline-research-count">{`${items.length} found`}</span>
        {sourcePaths.length === 0 ? null : <span className="board-pipeline-research-source">{sourcePaths.join(' · ')}</span>}
      </h3>
      <Text muted>The stand-alone codebases of the repository. You confirm them as entities in the next step.</Text>
      <ul className="board-pipeline-research-layout-items">
        {items.map((item) => (
          <li key={item.findingId} className="board-pipeline-research-layout-item">
            <MonoId text={item.folder} tone="strong" />
            {item.description === null ? null : <Text typeRole="small" muted>{item.description}</Text>}
          </li>
        ))}
      </ul>
    </section>
  );
}
