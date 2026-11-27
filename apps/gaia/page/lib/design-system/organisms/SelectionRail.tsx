/**
 * A narrow column of rows to choose one from: a filter field, an optional attention line, the leading rows, the grouped rows, a no-match line and
 * an optional note. The rows take one tab stop, the selected row's or the first, and the arrow keys, Home and End move between them with
 * wrapping. As the current page it is a navigation; as a filter its selected row is pressed.
 */
import { useId, type KeyboardEvent, type ReactNode } from 'react';

import { StateDot }        from '../atoms/StateDot.tsx';
import { Text }            from '../atoms/Text.tsx';
import { TextField }       from '../atoms/TextField.tsx';
import { Row }             from '../molecules/Row.tsx';
import { RovingFocusUtil } from '../utils/RovingFocusUtil.ts';

export interface SelectionRailRow {
  readonly key:            string;
  /** The row's whole sentence for a screen reader: its title, subtitle and what its end shows. */
  readonly accessibleName: string;
  readonly selected:       boolean;
  readonly title:          ReactNode;
  readonly subtitle?:      string;
  /** A small mark before the title. */
  readonly mark?:          ReactNode;
  /** What the row holds at its end, such as counts and a state. */
  readonly end?:           ReactNode;
}

export interface SelectionRailGroup {
  readonly key:   string;
  readonly label: string;
  readonly rows:  readonly SelectionRailRow[];
}

/** `current-page`: the rows lead to places and the selected row is the page shown; `pressed`: the rows filter and the selected row is on. */
export type SelectionRailMeaning = 'current-page' | 'pressed';

export interface SelectionRailProps {
  readonly label:              string;
  /** The filter field's hidden label, also its placeholder. */
  readonly filterLabel:        string;
  readonly filterText:         string;
  readonly onFilterTextChange: (filterText: string) => void;
  readonly groups:             readonly SelectionRailGroup[];
  readonly onSelect:           (rowKey: string) => void;
  /** The rows before the groups, in no group. */
  readonly leadingRows?:       readonly SelectionRailRow[];
  /** What deserves a look, in one line under the filter field. */
  readonly attentionText?:     string | null;
  /** Shown under the rows while it is set: the filter matched nothing. */
  readonly noMatchText?:       string | null;
  /** A note at the foot of the column. */
  readonly note?:              string | null;
  /** `current-page` by default. */
  readonly meaning?:           SelectionRailMeaning;
}

interface SelectionRailRowButtonProps {
  readonly row:      SelectionRailRow;
  readonly tabStop:  boolean;
  readonly meaning:  SelectionRailMeaning;
  readonly onSelect: (rowKey: string) => void;
}

function SelectionRailRowButton({
  row, tabStop, meaning, onSelect
}: SelectionRailRowButtonProps) {
  return (
    <button
      type="button"
      className="design-system-selection-rail-row"
      data-selection-rail-row=""
      aria-label={row.accessibleName}
      aria-current={meaning === 'current-page' && row.selected ? 'page' : undefined}
      aria-pressed={meaning === 'pressed' ? row.selected : undefined}
      data-selected={row.selected ? '' : undefined}
      tabIndex={tabStop ? 0 : -1}
      onClick={() => onSelect(row.key)}
    >
      {row.mark === undefined ? null : <span className="design-system-selection-rail-mark">{row.mark}</span>}
      <span className="design-system-selection-rail-row-text">
        {row.title}
        {row.subtitle === undefined ? null : <span className="design-system-selection-rail-subtitle"><Text typeRole="small" subtle>{row.subtitle}</Text></span>}
      </span>
      {row.end === undefined ? null : <span className="design-system-selection-rail-row-end">{row.end}</span>}
    </button>
  );
}

export function SelectionRail({
  label, filterLabel, filterText, onFilterTextChange, groups, onSelect, leadingRows = [], attentionText = null, noMatchText = null, note = null,
  meaning = 'current-page'
}: SelectionRailProps) {
  const groupLabelIdPrefix = useId();
  const rows = [...leadingRows, ...groups.flatMap((group) => group.rows)];
  const selectedIndex = rows.findIndex((row) => row.selected);
  const tabStopIndex = selectedIndex === -1 ? 0 : selectedIndex;

  const moveFocus = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (!RovingFocusUtil.isRovingKey(event.key, 'both')) return;
    const rowButtons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-selection-rail-row]')];
    const currentIndex = rowButtons.findIndex((button) => button === document.activeElement);
    const targetIndex = RovingFocusUtil.targetIndexOf(event.key, currentIndex === -1 ? tabStopIndex : currentIndex, rowButtons.length, 'both');
    if (targetIndex === null) return;
    event.preventDefault();
    rowButtons[targetIndex]?.focus();
  };
  const rowButtonOf = (row: SelectionRailRow) => (
    <SelectionRailRowButton key={row.key} row={row} tabStop={rows.indexOf(row) === tabStopIndex} meaning={meaning} onSelect={onSelect} />
  );

  const contents = (
    <>
      <TextField label={filterLabel} labelHidden placeholder={filterLabel} value={filterText} onChange={onFilterTextChange} />
      {attentionText === null
        ? null
        : (
          <span className="design-system-selection-rail-attention">
            <Row centerY gap="eight">
              <StateDot tone="neutral" shape="dashed-ring" small />
              <Text typeRole="small" muted>{attentionText}</Text>
            </Row>
          </span>
        )}
      <div className="design-system-selection-rail-rows" onKeyDown={moveFocus}>
        {leadingRows.map(rowButtonOf)}
        {groups.map((group) => {
          const groupLabelId = `${groupLabelIdPrefix}-${group.key}`;
          return (
            <div key={group.key} className="design-system-selection-rail-group" role="group" aria-labelledby={groupLabelId}>
              <span className="design-system-selection-rail-group-label" id={groupLabelId}><Text typeRole="small" subtle bold>{group.label}</Text></span>
              {group.rows.map(rowButtonOf)}
            </div>
          );
        })}
        {noMatchText === null ? null : <p className="design-system-selection-rail-no-match">{noMatchText}</p>}
      </div>
      {note === null ? null : <p className="design-system-selection-rail-note">{note}</p>}
    </>
  );

  return meaning === 'current-page'
    ? <nav className="design-system-selection-rail" aria-label={label}>{contents}</nav>
    : <section className="design-system-selection-rail" aria-label={label}>{contents}</section>;
}
