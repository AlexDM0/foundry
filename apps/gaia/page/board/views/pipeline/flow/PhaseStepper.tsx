/**
 * The four phases as equal tabs with chevrons between them: each shows its phase dot, its name, "N steps · N gates" and the pill of what
 * waits there (a question, the live tickets, the editing changes), which pops in. A press opens that phase; the open one carries the orange
 * tint.
 */
import { Fragment }  from 'react';
import { Tag, Text } from '../../../../lib/design-system/DesignSystemInterface.ts';

import { FlowGlyph }                        from './FlowGlyph.tsx';
import type { PhaseTabView, PipelinePhase } from './PipelinePhaseModel.ts';

export interface PhaseStepperProps {
  readonly tabs:      readonly PhaseTabView[];
  readonly openPhase: PipelinePhase;
  readonly onOpen:    (phase: PipelinePhase) => void;
}

export function PhaseStepper({ tabs, openPhase, onOpen }: PhaseStepperProps) {
  return (
    <div className="board-pipeline-phase-stepper" role="group" aria-label="Pipeline phases">
      {tabs.map((tab, i) => (
        <Fragment key={tab.phase}>
          {i === 0 ? null : <FlowGlyph glyph="chevron" />}
          <button
            type="button"
            className="board-pipeline-phase-tab"
            aria-pressed={tab.phase === openPhase}
            data-phase={tab.phase}
            onClick={() => onOpen(tab.phase)}
          >
            <span className="board-pipeline-phase-tab-head">
              <span className="board-pipeline-phase-dot" data-phase={tab.phase} data-ring={tab.runsNoStep ? '' : undefined} aria-hidden="true" />
              <Text typeRole="page">{tab.name}</Text>
              {tab.pill === null ? null : <Tag text={tab.pill.text} tone={tab.pill.tone} pops />}
            </span>
            <span className="board-pipeline-phase-tab-sub">
              <Text typeRole="tab" muted>{tab.subText}</Text>
            </span>
          </button>
        </Fragment>
      ))}
    </div>
  );
}
