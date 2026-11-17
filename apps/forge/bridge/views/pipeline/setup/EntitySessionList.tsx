/**
 * The research sessions of a forge over entities (MonoResearch): the forge's session, then each entity's under its group. A row is a
 * button that shows that session's findings and chat, with its key in mono, its kind, its state in words and its open research questions;
 * beside a live session, its own Stop. The selected row has the boards' selection look, never an orange edge.
 */
import { CountBadge } from 'design-system/CountBadge';
import { MonoId }     from 'design-system/MonoId';
import { Tag }        from 'design-system/Tag';
import { Text }       from 'design-system/Text';

import type { DisplayState }                               from '../../../../src/lib/tracker-model/@types/Task.ts';
import { CommandButton }                                   from '../../../shell/CommandButton.tsx';
import { StateToneUtil }                                   from '../../../utils/StateToneUtil.ts';
import { PipelineLevelModel, type PipelineLevel }          from '../entities/PipelineLevelModel.ts';
import type { EntitySessionRowView, ResearchSessionState } from './EntitySessionListModel.ts';

export interface EntitySessionListProps {
  readonly rows:      readonly EntitySessionRowView[];
  readonly countText: string;
  readonly onSelect:  (level: PipelineLevel) => void;
}

/** The palette row each state's tag takes; a session that has not started has no state colour. */
const STATE_LOOKS: Readonly<Record<Exclude<ResearchSessionState, 'not-started'>, DisplayState>> = Object.freeze({
  'researching':   'in-progress',
  'research-done': 'delivered',
  'stopping':      'paused',
  'stopped':       'abandoned',
});

function StateTag({ row }: { readonly row: EntitySessionRowView }) {
  if (row.state === 'not-started') return <Tag text={row.stateText} tone="neutral" dashed />;
  return <Tag text={row.stateText} {...StateToneUtil.tagLookOf(STATE_LOOKS[row.state])} dot={row.state === 'researching'} />;
}

function SessionRow({ row, onSelect }: { readonly row: EntitySessionRowView; readonly onSelect: (level: PipelineLevel) => void }) {
  const isForge = PipelineLevelModel.isForgeLevel(row.level);
  return (
    <li className="bridge-research-session" data-state={row.state}>
      <button
        type="button"
        className="bridge-research-session-row"
        aria-label={row.accessibleName}
        aria-pressed={row.selected}
        data-selected={row.selected ? '' : undefined}
        onClick={() => onSelect(row.level)}
      >
        <span className="bridge-research-session-text">
          {isForge ? <Text bold>{row.name}</Text> : <MonoId text={row.name} tone="strong" weight={row.selected ? 'bold' : 'medium'} />}
          <Text typeRole="small" subtle>{row.kindText}</Text>
        </span>
        <span className="bridge-research-session-end">
          {row.openQuestionCount === 0 ? null : <CountBadge count={row.openQuestionCount} tone="state" stateTone="accent" />}
          <StateTag row={row} />
        </span>
      </button>
      {row.stopCommand === null
        ? null
        : <CommandButton label="Stop" accessibleName={row.stopName} command={row.stopCommand} compact />}
    </li>
  );
}

export function EntitySessionList({ rows, countText, onSelect }: EntitySessionListProps) {
  return (
    <section className="bridge-research-sessions" aria-label="Research sessions">
      <h3 className="bridge-pipeline-research-card-head">
        <span className="bridge-pipeline-research-card-title">Sessions</span>
        <span className="bridge-pipeline-research-count">{countText}</span>
      </h3>
      <ul className="bridge-research-session-list">
        {rows.flatMap((row) => [
          ...(row.groupLabel === null
            ? []
            : [<li key={`group-${row.groupLabel}`} className="bridge-research-session-group" aria-hidden="true"><Text typeRole="small" subtle bold>{row.groupLabel}</Text></li>]),
          <SessionRow key={row.level.kind === 'entity' ? `entity-${row.level.key}` : row.level.kind} row={row} onSelect={onSelect} />,
        ])}
      </ul>
    </section>
  );
}
