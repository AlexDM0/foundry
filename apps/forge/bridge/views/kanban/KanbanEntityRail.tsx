/**
 * The Kanban's entity filter in monorepo mode, on the design system's selection rail beside the lanes: a filter field, the row that shows
 * every entity, then the entities in the groups Apps, Packages and Root, each with the count of open tickets it holds. A press shows only
 * that entity's tickets; the chosen row is pressed.
 */
import { CountBadge }                           from 'design-system/CountBadge';
import { MonoId }                               from 'design-system/MonoId';
import { SelectionRail, type SelectionRailRow } from 'design-system/SelectionRail';
import { Text }                                 from 'design-system/Text';
import { useState }                             from 'react';

import { KanbanEntityFilterModel, type KanbanEntityFilter, type KanbanEntityRailRow } from './KanbanEntityFilterModel.ts';

export interface KanbanEntityRailProps {
  readonly filter:   KanbanEntityFilter;
  /** `null` shows every entity. */
  readonly onChoose: (entityKey: string | null) => void;
}

const ALL_ENTITIES_ROW_KEY = 'all';

function rowKeyOf(row: KanbanEntityRailRow): string {
  return row.entityKey === null ? ALL_ENTITIES_ROW_KEY : `entity:${row.entityKey}`;
}

function selectionRailRowOf(row: KanbanEntityRailRow): SelectionRailRow {
  return {
    key:            rowKeyOf(row),
    accessibleName: row.accessibleName,
    selected:       row.selected,
    title:          row.entityKey === null ? <Text bold>{row.name}</Text> : <MonoId text={row.name} tone="strong" weight={row.selected ? 'bold' : 'medium'} />,
    subtitle:       row.kindText,
    end:            <CountBadge count={row.openTicketCount} tone="neutral" />,
  };
}

export function KanbanEntityRail({ filter, onChoose }: KanbanEntityRailProps) {
  const [filterText, setFilterText] = useState('');
  const rail = KanbanEntityFilterModel.railOf(filter, filterText);
  const rows = [rail.allRow, ...rail.groups.flatMap((group) => group.rows)];
  const chooseRow = (rowKey: string): void => {
    const row = rows.find((candidate) => rowKeyOf(candidate) === rowKey);
    if (row !== undefined) onChoose(row.entityKey);
  };
  return (
    <div className="bridge-kanban-entity-rail">
      <SelectionRail
        label="Kanban entities"
        filterLabel="Filter entities"
        filterText={filterText}
        onFilterTextChange={setFilterText}
        leadingRows={[selectionRailRowOf(rail.allRow)]}
        groups={rail.groups.map((group) => ({ key: group.groupKind, label: group.label, rows: group.rows.map(selectionRailRowOf) }))}
        onSelect={chooseRow}
        noMatchText={rail.nothingMatches ? 'No entity matches the filter.' : null}
        meaning="pressed"
      />
    </div>
  );
}
