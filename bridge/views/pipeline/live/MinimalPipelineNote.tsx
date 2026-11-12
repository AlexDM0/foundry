/**
 * The aside beside the smallest pipeline: what it is, the warning while no phase has a gate, and where a + adds a step.
 */
import type { PipelineFlowFacts } from '../../../../src/lib/tracker-model/@types/PipelineFacts.ts';

import { MinimalPipelineNoteModel } from './MinimalPipelineNoteModel.ts';

export interface MinimalPipelineNoteProps {
  readonly flow: Pick<PipelineFlowFacts, 'insertSlots' | 'gateRows'>;
}

export function MinimalPipelineNote({ flow }: MinimalPipelineNoteProps) {
  const note = MinimalPipelineNoteModel.noteOf(flow);
  return (
    <aside className="bridge-pipeline-minimal-note" aria-label="About this pipeline">
      <p className="bridge-pipeline-minimal-note-lead">
        <strong className="bridge-pipeline-minimal-note-title">The smallest pipeline</strong>
        Builder, then the merge train. No gates and no review is a valid state: a ticket lands right after its build.
      </p>
      {note.warningIsShown
        ? (
          <p className="bridge-pipeline-minimal-note-warning" role="note">
            <span className="bridge-pipeline-minimal-note-warning-mark" aria-hidden="true">!</span>
            Nothing checks a commit before it reaches main. Conflicts still go to the builder.
          </p>
        )
        : null}
      <section className="bridge-pipeline-minimal-note-steps" aria-label="Where steps go">
        <h3 className="bridge-pipeline-minimal-note-steps-title">Where steps go</h3>
        <ul className="bridge-pipeline-minimal-note-step-list">
          {note.stepLines.map((line) => (
            <li key={line.key} className="bridge-pipeline-minimal-note-step">
              <span className="bridge-pipeline-minimal-note-step-mark" aria-hidden="true">+</span>
              {line.text}
            </li>
          ))}
        </ul>
        <p className="bridge-pipeline-minimal-note-closing">A + appears only where a step is missing; a removed step leaves its + behind.</p>
      </section>
    </aside>
  );
}
