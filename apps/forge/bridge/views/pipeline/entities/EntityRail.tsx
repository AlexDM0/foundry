/**
 * The boards' left column in monorepo mode: a filter field, a one-line count of what deserves a look, then the forge row and the
 * entities in the groups Apps, Packages and Root. Each row is a button with the key in mono, the kind muted, one status mark and the
 * counts of open questions and pending edits; a press moves to that level. The rows take one tab stop, and the arrow keys, Home and End
 * move between them. The selected row has the boards' selection look, a filled neutral ground and a 1 px border.
 */
import { CountBadge }                   from 'design-system/CountBadge';
import { Icon }                         from 'design-system/Icon';
import { MonoId }                       from 'design-system/MonoId';
import { RovingFocusUtil }              from 'design-system/RovingFocusUtil';
import { Row }                          from 'design-system/Row';
import { StateDot }                     from 'design-system/StateDot';
import { Tag }                          from 'design-system/Tag';
import { Text }                         from 'design-system/Text';
import { TextField }                    from 'design-system/TextField';
import { useState, type KeyboardEvent } from 'react';

import { EntityRailModel, type EntityRailFacts, type EntityRailRowView } from './EntityRailModel.ts';
import { PipelineLevelModel, type PipelineLevel }                        from './PipelineLevelModel.ts';

export interface EntityRailProps {
  readonly facts:    EntityRailFacts;
  readonly level:    PipelineLevel;
  readonly onSelect: (level: PipelineLevel) => void;
}

const NO_GATES_NOTE = 'An entity without gates lands its tickets unchecked. It never blocks Apply.';

function StatusMark({ row }: { readonly row: EntityRailRowView }) {
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
        <span className="bridge-entity-rail-checked">
          <StateDot tone="success" small />
          <Text typeRole="small" subtle>{row.statusText}</Text>
        </span>
      );
  }
}

interface RailRowProps {
  readonly row:      EntityRailRowView;
  readonly tabStop:  boolean;
  readonly onSelect: (level: PipelineLevel) => void;
}

function RailRow({ row, tabStop, onSelect }: RailRowProps) {
  const isForge = PipelineLevelModel.isForgeLevel(row.level);
  return (
    <button
      type="button"
      className="bridge-entity-rail-row"
      data-rail-row=""
      aria-label={row.accessibleName}
      aria-current={row.selected ? 'page' : undefined}
      data-selected={row.selected ? '' : undefined}
      tabIndex={tabStop ? 0 : -1}
      onClick={() => onSelect(row.level)}
    >
      {isForge ? <span className="bridge-entity-rail-forge-mark"><Icon name="flow" label={null} /></span> : null}
      <span className="bridge-entity-rail-row-text">
        {isForge ? <Text bold>{row.name}</Text> : <MonoId text={row.name} tone="strong" weight={row.selected ? 'bold' : 'medium'} />}
        <span className="bridge-entity-rail-row-kind"><Text typeRole="small" subtle>{row.kindText}</Text></span>
      </span>
      <span className="bridge-entity-rail-row-end">
        {row.openQuestionCount === 0 ? null : <CountBadge count={row.openQuestionCount} tone="state" stateTone="accent" />}
        {row.pendingEditCount === 0 ? null : <CountBadge count={row.pendingEditCount} tone="neutral" />}
        <StatusMark row={row} />
      </span>
    </button>
  );
}

export function EntityRail({ facts, level, onSelect }: EntityRailProps) {
  const [filterText, setFilterText] = useState('');
  const rail = EntityRailModel.railOf(facts, level, filterText);
  const rows = EntityRailModel.rowsInOrderOf(rail);
  const selectedIndex = rows.findIndex((row) => row.selected);
  const tabStopIndex = selectedIndex === -1 ? 0 : selectedIndex;

  const moveFocus = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (!RovingFocusUtil.isRovingKey(event.key, 'both')) return;
    const rowButtons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-rail-row]')];
    const currentIndex = rowButtons.findIndex((button) => button === document.activeElement);
    const targetIndex = RovingFocusUtil.targetIndexOf(event.key, currentIndex === -1 ? tabStopIndex : currentIndex, rowButtons.length, 'both');
    if (targetIndex === null) return;
    event.preventDefault();
    rowButtons[targetIndex]?.focus();
  };

  return (
    <nav className="bridge-entity-rail" aria-label="Pipeline levels">
      <TextField label="Filter entities" labelHidden placeholder="Filter entities" value={filterText} onChange={setFilterText} />
      {rail.attentionText === null
        ? null
        : (
          <span className="bridge-entity-rail-attention">
            <Row centerY gap="eight">
              <StateDot tone="neutral" shape="dashed-ring" small />
              <Text typeRole="small" muted>{rail.attentionText}</Text>
            </Row>
          </span>
        )}
      <div className="bridge-entity-rail-rows" onKeyDown={moveFocus}>
        <RailRow row={rail.forgeRow} tabStop={tabStopIndex === 0} onSelect={onSelect} />
        {rail.groups.map((group) => (
          <div key={group.groupKind} className="bridge-entity-rail-group" role="group" aria-label={group.label}>
            <span className="bridge-entity-rail-group-label" aria-hidden="true"><Text typeRole="small" subtle bold>{group.label}</Text></span>
            {group.rows.map((row) => {
              const index = rows.indexOf(row);
              return <RailRow key={row.name} row={row} tabStop={tabStopIndex === index} onSelect={onSelect} />;
            })}
          </div>
        ))}
        {rail.nothingMatches ? <p className="bridge-entity-rail-no-match">No entity matches the filter.</p> : null}
      </div>
      {rail.someEntityHasNoGates ? <p className="bridge-entity-rail-note">{NO_GATES_NOTE}</p> : null}
    </nav>
  );
}
