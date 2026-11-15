/**
 * The small line drawings of the Focus layout, hidden from the accessibility tree: each step kind's mark, the add card's plus, the check of
 * a readiness line, the chevron between phase tabs and the arrow between steps. They stroke in the current colour.
 */
import type { ReactNode } from 'react';

import type { StepKind } from './PipelineFlowModel.ts';

export type FlowGlyphName = StepKind | 'add' | 'plus' | 'check' | 'chevron' | 'arrow';

interface GlyphDrawing {
  readonly viewBox: string;
  readonly shapes:  ReactNode;
}

const GLYPH_DRAWINGS: Readonly<Record<FlowGlyphName, GlyphDrawing>> = Object.freeze({
  agent: {
    viewBox: '0 0 14 14',
    shapes:  (
      <>
        <rect x="2" y="4" width="10" height="8" rx="2" />
        <path d="M7 1.8 V4 M5.2 7.4 V8.6 M8.8 7.4 V8.6" />
      </>
    ),
  },
  you: {
    viewBox: '0 0 14 14',
    shapes:  (
      <>
        <circle cx="7" cy="4.6" r="2.4" />
        <path d="M2.4 12.2 C2.4 9.8 4.4 8.6 7 8.6 C9.6 8.6 11.6 9.8 11.6 12.2" />
      </>
    ),
  },
  gates: {
    viewBox: '0 0 14 14',
    shapes:  (
      <>
        <circle cx="7" cy="7" r="5.3" />
        <path d="M4.6 7.2 L6.3 8.9 L9.5 5.3" />
      </>
    ),
  },
  automatic: { viewBox: '0 0 14 14', shapes: <path d="M3 3.5 L6.5 7 L3 10.5 M7.5 3.5 L11 7 L7.5 10.5" /> },
  add:       {
    viewBox: '0 0 14 14',
    shapes:  (
      <>
        <circle cx="7" cy="7" r="5.3" />
        <path d="M7 4.6 V9.4 M4.6 7 H9.4" />
      </>
    ),
  },
  plus:    { viewBox: '0 0 12 12', shapes: <path d="M6 2 V10 M2 6 H10" /> },
  check:   { viewBox: '0 0 12 12', shapes: <path d="M2 6.5 L5 9 L10 3" /> },
  chevron: { viewBox: '0 0 18 12', shapes: <path d="M6.5 2.5 L10.5 6 L6.5 9.5" /> },
  arrow:   { viewBox: '0 0 22 12', shapes: <path d="M4 6 H17 M13.5 2.5 L17 6 L13.5 9.5" /> },
});

export interface FlowGlyphProps {
  readonly glyph: FlowGlyphName;
}

export function FlowGlyph({ glyph }: FlowGlyphProps) {
  const drawing = GLYPH_DRAWINGS[glyph];
  return (
    <svg className="bridge-pipeline-glyph" data-glyph={glyph} viewBox={drawing.viewBox} aria-hidden="true">
      {drawing.shapes}
    </svg>
  );
}
