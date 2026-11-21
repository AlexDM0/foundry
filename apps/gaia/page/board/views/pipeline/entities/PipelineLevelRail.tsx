/**
 * The boards' left column in monorepo mode, the levels of the pipeline on the design system's selection rail: a filter field, a one-line
 * count of what deserves a look, then the forge row and the entities in the groups Apps, Packages and Root. Each row shows the key in mono,
 * the kind muted, one status mark and the counts of open questions and pending edits; a press moves to that level. A screen may give its
 * own marks, as the constitution step marks each entity's constitution, in place of the gates marks, and a live screen a line of each
 * level's work after its kind.
 */
import { CountBadge }                           from 'design-system/CountBadge';
import { Icon }                                 from 'design-system/Icon';
import { MonoId }                               from 'design-system/MonoId';
import { SelectionRail, type SelectionRailRow } from 'design-system/SelectionRail';
import { StateDot }                             from 'design-system/StateDot';
import { Tag }                                  from 'design-system/Tag';
import { Text }                                 from 'design-system/Text';
import { useState, type ReactNode }             from 'react';

import { PipelineLevelModel, type PipelineLevel } from './PipelineLevelModel.ts';
import {
  PipelineLevelRailModel,
  type PipelineLevelRailActivityTexts,
  type PipelineLevelRailFacts,
  type PipelineLevelRailMarkTexts,
  type PipelineLevelRailRowView
} from './PipelineLevelRailModel.ts';

/** A screen's own mark on each entity row, its word and its attention line, in place of the gates marks. */
export interface PipelineLevelRailMarks extends PipelineLevelRailMarkTexts {
  readonly markOf: (entityKey: string) => ReactNode;
}

export interface PipelineLevelRailProps {
  readonly facts:           PipelineLevelRailFacts;
  readonly level:           PipelineLevel;
  readonly onSelect:        (level: PipelineLevel) => void;
  /** Absent: each row carries its gates mark. */
  readonly marks?:          PipelineLevelRailMarks | null;
  /** Absent: the rows carry no line of their work. */
  readonly activityTextOf?: PipelineLevelRailActivityTexts | null;
}

const NO_GATES_NOTE = 'An entity without gates lands its tickets unchecked. It never blocks Apply.';

const FORGE_LEVEL_ROW_KEY = 'forge-level';

function StatusMark({ row }: { readonly row: PipelineLevelRailRowView }) {
  if (row.status === null || row.statusText === null) return null;
  switch (row.status) {
    case 'gate-running':
      return <Tag text={row.statusText} tone="state" stateTone="accent" busy />;
    case 'no-gates':
      return <Tag text={row.statusText} tone="neutral" dashed />;
    case 'default-constitution':
      return <Tag text={row.statusText} tone="neutral" />;
    case 'kept-for-a-person':
      return <Text typeRole="small" subtle>{row.statusText}</Text>;
    case 'checked':
      return (
        <span className="board-pipeline-level-rail-checked">
          <StateDot tone="success" small />
          <Text typeRole="small" subtle>{row.statusText}</Text>
        </span>
      );
  }
}

function rowKeyOf(row: PipelineLevelRailRowView): string {
  return PipelineLevelModel.isForgeLevel(row.level) ? FORGE_LEVEL_ROW_KEY : `entity:${row.name}`;
}

/** The kind, then the level's work; the forge row's work alone, as MonoLive draws "4 of 6 jobs", since its kind says no more. */
function subtitleOf(row: PipelineLevelRailRowView, isForge: boolean): string {
  if (row.activityText === null) return row.kindText;
  return isForge ? row.activityText : `${row.kindText} · ${row.activityText}`;
}

function selectionRailRowOf(row: PipelineLevelRailRowView, marks: PipelineLevelRailMarks | null): SelectionRailRow {
  const isForge = PipelineLevelModel.isForgeLevel(row.level);
  return {
    key:            rowKeyOf(row),
    accessibleName: row.accessibleName,
    selected:       row.selected,
    title:          isForge ? <Text bold>{row.name}</Text> : <MonoId text={row.name} tone="strong" weight={row.selected ? 'bold' : 'medium'} />,
    subtitle:       subtitleOf(row, isForge),
    ...isForge ? { mark: <Icon name="flow" label={null} /> } : {},
    end:            (
      <>
        {row.openQuestionCount === 0 ? null : <CountBadge count={row.openQuestionCount} tone="state" stateTone="accent" />}
        {row.pendingEditCount === 0 ? null : <CountBadge count={row.pendingEditCount} tone="neutral" />}
        {marks === null || isForge ? <StatusMark row={row} /> : marks.markOf(row.name)}
      </>
    ),
  };
}

export function PipelineLevelRail({
  facts, level, onSelect, marks = null, activityTextOf = null
}: PipelineLevelRailProps) {
  const [filterText, setFilterText] = useState('');
  const rail = PipelineLevelRailModel.railOf(facts, level, filterText, marks, activityTextOf);
  const rowsByKey = new Map(PipelineLevelRailModel.rowsInOrderOf(rail).map((row) => [rowKeyOf(row), row] as const));
  const selectRow = (rowKey: string): void => {
    const row = rowsByKey.get(rowKey);
    if (row !== undefined) onSelect(row.level);
  };
  return (
    <SelectionRail
      label="Pipeline levels"
      filterLabel="Filter entities"
      filterText={filterText}
      onFilterTextChange={setFilterText}
      leadingRows={[selectionRailRowOf(rail.forgeRow, marks)]}
      groups={rail.groups.map((group) => ({ key: group.groupKind, label: group.label, rows: group.rows.map((row) => selectionRailRowOf(row, marks)) }))}
      onSelect={selectRow}
      attentionText={rail.attentionText}
      noMatchText={rail.nothingMatches ? 'No entity matches the filter.' : null}
      note={rail.someEntityHasNoGates ? NO_GATES_NOTE : null}
    />
  );
}
