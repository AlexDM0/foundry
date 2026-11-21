/**
 * The scripts the research found, as a table of name, command and meaning under its column names and a head that says where they were
 * found and that none runs here. A script that needs a network or a service shows its dot and its note in place of its meaning; one that
 * is no gate says so.
 */
import { Tag } from '../../../../lib/design-system/DesignSystemInterface.ts';

import { FlowGlyph }      from '../flow/FlowGlyph.tsx';
import type { ScriptRow } from './ResearchStepModel.ts';

export interface ScriptRowsProps {
  readonly rows:       readonly ScriptRow[];
  readonly sourceText: string;
  readonly countText:  string;
}

function RowMeaning({ row }: { readonly row: ScriptRow }) {
  if (row.needsNote !== null) {
    return (
      <span className="board-pipeline-script-needs" title={row.meaning}>
        <span className="board-pipeline-script-needs-dot" aria-hidden="true" />
        {row.needsNote}
      </span>
    );
  }
  return (
    <span className="board-pipeline-script-meaning" data-not-a-gate={row.notAGate ? '' : undefined}>
      {row.notAGate ? `${row.meaning} Not a gate.` : row.meaning}
    </span>
  );
}

export function ScriptRows({ rows, sourceText, countText }: ScriptRowsProps) {
  return (
    <section className="board-pipeline-research-card" aria-label="Scripts" data-topic="scripts">
      <h3 className="board-pipeline-research-card-head">
        <span className="board-pipeline-research-check"><FlowGlyph glyph="check" /></span>
        <span className="board-pipeline-research-card-title">Scripts</span>
        <span className="board-pipeline-research-count">{countText}</span>
        <span className="board-pipeline-research-source">{sourceText}</span>
      </h3>
      <div className="board-pipeline-script" data-head="" aria-hidden="true">
        <span>Script</span>
        <span>Command</span>
        <span>What it is</span>
      </div>
      <ul className="board-pipeline-scripts">
        {rows.map((row) => (
          <li key={row.findingId} className="board-pipeline-script">
            <b className="board-pipeline-script-name">{row.name}</b>
            <code className="board-pipeline-script-run">{row.run}</code>
            <RowMeaning row={row} />
            {row.recheck ? <Tag text="recheck" tone="neutral" change="changed" /> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
