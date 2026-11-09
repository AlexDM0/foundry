/**
 * The Tickets view: its head (title, count, Group by epic), the toolbar (search, the type, epic and status chips), and the sortable table
 * of `TicketsModel`, a click, Enter or Space on a row opening its row form in the detail panel. The search and the chips live in the view;
 * the grouping by epic is kept per board.
 */
import {
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent
} from 'react';

import type { TicketsBoardState }                from '../../@types/TicketsBoardState.ts';
import { ChipFilterUtil }                        from '../../chips/ChipFilterUtil.ts';
import { CARD_EPIC_CHIP_LIMIT }                  from '../../chips/EpicChipUtil.ts';
import { EpicChips }                             from '../../chips/EpicChips.tsx';
import { FilterChipGroup }                       from '../../chips/FilterChipGroup.tsx';
import { StateBadge }                            from '../../chips/StateBadge.tsx';
import { PriorityMark, TypeMark, WaitingOnMark } from '../../chips/TicketMarks.tsx';
import type { PreferenceStore }                  from '../../preferences/PreferenceStore.ts';
import { DetailRoute }                           from '../../shell/DetailRoute.ts';
import { useDetailRouting }                      from '../../shell/DetailRouting.ts';
import { useFinishedWorkWindow }                 from '../../shell/FinishedWorkWindow.ts';
import { HashRouter }                            from '../../shell/HashRouter.ts';
import type { MatchPiece }                       from '../../utils/SearchMatchUtil.ts';
import {
  DEFAULT_TICKET_VIEW,
  TICKET_GROUPING_CHOICE_NAME,
  TICKET_SORT_KEYS,
  TICKET_STATUS_CHIPS,
  TICKET_TYPE_CHIPS,
  TICKETS_FLAT_CHOICE,
  TICKETS_GROUPED_BY_EPIC_CHOICE,
  TicketsModel,
  type TicketEpicHeadModel,
  type TicketRowModel,
  type TicketSortKey,
  type TicketView
} from './TicketsModel.ts';

export interface TicketsViewProps {
  readonly boardState: TicketsBoardState;
  /** The board's own preferences; `null` until the Overseer named its tracker. */
  readonly boardStore: PreferenceStore | null;
}

/** The id, branch and task columns are mono, as on the static table. */
const MONO_COLUMNS: readonly TicketSortKey[] = ['id', 'branch'];

/** A click on a link or button inside a row is that control's own, never the row's. */
const ROW_CONTROL_SELECTOR = 'a, button';

function MatchedText({ pieces }: { readonly pieces: readonly MatchPiece[] }) {
  return (
    <>
      {pieces.map((piece, index) => (piece.isMatch
        ? <mark key={index} className="bridge-match">{piece.text}</mark>
        : piece.text))}
    </>
  );
}

function BranchIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="4" cy="3.5" r="1.8" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="4" cy="12.5" r="1.8" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="12" cy="5.5" r="1.8" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M4 5.3v5.4M12 7.3c0 2.5-3 2.7-6.6 4.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="7" cy="7" r="4.8" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10.6 10.6 14 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function TicketRow({ row, showsEpicColumn }: { readonly row: TicketRowModel; readonly showsEpicColumn: boolean }) {
  const routing = useDetailRouting();
  const detailItem = { form: 'ticket-row', ticketId: row.ticketId } as const;
  const openRow = (event: MouseEvent<HTMLTableRowElement>): void => {
    if (event.target instanceof Element && event.target.closest(ROW_CONTROL_SELECTOR) !== null) return;
    routing.toggle(detailItem);
  };
  const openRowByKey = (event: KeyboardEvent<HTMLTableRowElement>): void => {
    if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    routing.toggle(detailItem);
  };
  return (
    <tr
      className="bridge-ticket-row"
      data-ticket-id={row.ticketId}
      data-state={row.stateToken}
      data-selected={routing.isOpen(detailItem) ? '' : undefined}
      tabIndex={0}
      onClick={openRow}
      onKeyDown={openRowByKey}
    >
      <td className="bridge-ticket-mono">
        <a href={routing.openerHrefOf(detailItem)}>{row.idText}</a>
      </td>
      <td>
        <MatchedText pieces={row.titlePieces} />
        {row.priority === 'low' ? ' ' : null}
        {row.priority === null ? null : <PriorityMark priority={row.priority} />}
        {row.integration === null
          ? null
          : (
            <span className="bridge-integration-mark" title={row.integration.title}>
              <BranchIcon />
              <MatchedText pieces={row.integration.groupPieces} />
            </span>
          )}
        <WaitingOnMark ticketIds={row.waitingOn} hrefOf={(ticketId) => routing.openerHrefOf({ form: 'ticket-row', ticketId })} />
      </td>
      {showsEpicColumn
        ? (
          <td>
            <EpicChips epics={row.epics} limit={CARD_EPIC_CHIP_LIMIT} />
          </td>
        )
        : null}
      <td><TypeMark type={row.ticketType} /></td>
      <td>
        <StateBadge state={row.stateToken} label={row.stateLabel} />
        {row.pauseText === null ? null : <span className="bridge-ticket-pause" title={row.pauseTitle ?? undefined}>{row.pauseText}</span>}
      </td>
      <td className="bridge-ticket-mono"><MatchedText pieces={row.branchPieces} /></td>
      <td className="bridge-ticket-mono">
        {row.task === null
          ? null
          : <a href={HashRouter.fragmentOf({ tab: 'progress', item: DetailRoute.itemTextOf({ form: 'task-row', taskId: row.task.taskId }) })}>{row.task.labelText}</a>}
      </td>
    </tr>
  );
}

function EpicHeadRow({ head, columnCount }: { readonly head: TicketEpicHeadModel | null; readonly columnCount: number }) {
  return (
    <tr className="bridge-ticket-epic-head" data-epic-slot={head === null ? undefined : String(head.epic.slot)}>
      <td colSpan={columnCount}>
        <div className="bridge-ticket-epic-line">
          {head === null
            ? <span className="bridge-ticket-epic-title">No epic</span>
            : (
              <>
                <a className="bridge-ticket-epic-title" href={HashRouter.fragmentOf({ tab: 'epics', item: DetailRoute.epicItemTextOf(head.epic.key) })}>
                  <span className="bridge-epic-swatch" aria-hidden="true" />
                  {head.epic.title}
                </a>
                <span className="bridge-ticket-epic-progress" role="img" aria-label={head.rollupLabel}>
                  {head.segments.map((segment) => (
                    <span
                      key={segment.state}
                      className="bridge-ticket-epic-segment"
                      data-state={segment.state}
                      style={{ flexGrow: segment.count }}
                      title={`${segment.label}: ${segment.count}`}
                    />
                  ))}
                </span>
                <span className="bridge-ticket-epic-done">{head.doneText}</span>
                <span className="bridge-ticket-epic-facts">
                  {head.facts.map((fact) => (
                    <span key={fact.label} className="bridge-ticket-epic-fact">
                      <b>{fact.label}</b>
                      <span title={fact.title ?? undefined}>{fact.value}</span>
                    </span>
                  ))}
                </span>
              </>
            )}
        </div>
      </td>
    </tr>
  );
}

export function TicketsView({ boardState, boardStore }: TicketsViewProps) {
  const finishedWorkWindow = useFinishedWorkWindow();
  const searchInput = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<TicketView>(DEFAULT_TICKET_VIEW);
  const [groupedChoice, setGroupedChoice] = useState<boolean | null>(null);
  const groupedByEpic = groupedChoice ?? boardStore?.readChoice(TICKET_GROUPING_CHOICE_NAME) === TICKETS_GROUPED_BY_EPIC_CHOICE;
  const model = TicketsModel.ticketsModelOf(boardState, view, groupedByEpic, {
    cutoffEpochMilliseconds: finishedWorkWindow.cutoffEpochMilliseconds,
    nowEpochMilliseconds:    finishedWorkWindow.nowEpochMilliseconds,
  });
  const shownView = model.view;
  const sortedHeaders = TICKET_SORT_KEYS.filter((sortKey) => sortKey !== 'epic' || model.showsEpics);
  const columnCount = sortedHeaders.length + 1;

  const toggleGrouping = (): void => {
    setGroupedChoice(!groupedByEpic);
    boardStore?.writeChoice(TICKET_GROUPING_CHOICE_NAME, groupedByEpic ? TICKETS_FLAT_CHOICE : TICKETS_GROUPED_BY_EPIC_CHOICE, TICKETS_FLAT_CHOICE);
  };
  const toggleStatus = (value: string): void => {
    const chip = TICKET_STATUS_CHIPS.find((candidate) => candidate === value);
    if (chip !== undefined) setView({ ...shownView, statusChips: ChipFilterUtil.toggledChips(shownView.statusChips, chip) });
  };
  const toggleType = (value: string): void => {
    const type = TICKET_TYPE_CHIPS.find((candidate) => candidate === value);
    if (type !== undefined) setView({ ...shownView, typeChips: ChipFilterUtil.toggledChips(shownView.typeChips, type) });
  };
  const toggleEpic = (value: string): void => setView({ ...shownView, epicChips: ChipFilterUtil.toggledChips(shownView.epicChips, value) });
  const clear = (): void => {
    setView(TicketsModel.viewCleared(shownView));
    searchInput.current?.focus();
  };

  return (
    <section className="bridge-tickets" aria-label="Tickets">
      <div className="bridge-tickets-head">
        <span className="bridge-tickets-title">Tickets</span>
        <span className="bridge-tickets-count" aria-live="polite">{model.countText}</span>
        {model.showsEpics
          ? (
            <div className="bridge-segments bridge-tickets-grouping">
              <button type="button" aria-pressed={groupedByEpic} title="Group the table by epic, each with its roll-up" onClick={toggleGrouping}>Group by epic</button>
            </div>
          )
          : null}
      </div>
      <div className="bridge-tickets-toolbar" role="search">
        <div className="bridge-search">
          <SearchIcon />
          <input
            ref={searchInput}
            type="search"
            className="bridge-search-input"
            aria-label="Search tickets"
            placeholder="Search id, title, epic, branch, group, text"
            spellCheck={false}
            autoComplete="off"
            value={shownView.searchText}
            onChange={(event) => setView({ ...shownView, searchText: event.target.value })}
          />
        </div>
        <FilterChipGroup label="Type" labelIsShown chips={model.typeChips} pressed={shownView.typeChips} countByChip={model.countByChip.type} onToggle={toggleType} />
        {model.showsEpics
          ? <FilterChipGroup label="Epic" labelIsShown chips={model.epicChips} pressed={shownView.epicChips} countByChip={model.countByChip.epic} onToggle={toggleEpic} />
          : null}
        {model.narrows ? <button type="button" className="bridge-link-button" onClick={clear}>Clear search and filters</button> : null}
        <FilterChipGroup
          label="Status"
          labelIsShown
          startsOwnLine
          chips={model.statusChips}
          pressed={shownView.statusChips}
          countByChip={model.countByChip.status}
          onToggle={toggleStatus}
        />
      </div>
      <div className="bridge-tickets-scroll">
        <table className="bridge-tickets-table">
          <thead>
            <tr>
              {sortedHeaders.map((sortKey) => (
                <th
                  key={sortKey}
                  data-title-column={sortKey === 'title' ? '' : undefined}
                  data-mono={MONO_COLUMNS.includes(sortKey) ? '' : undefined}
                  data-sortable=""
                  aria-sort={shownView.sortKey === sortKey ? shownView.sortDirection : undefined}
                >
                  <button type="button" className="bridge-sort" onClick={() => setView(TicketsModel.viewSortedBy(shownView, sortKey))}>{sortKey}</button>
                </th>
              ))}
              <th data-mono="">task</th>
            </tr>
          </thead>
          <tbody>
            {model.emptyText === null
              ? model.groups.map((group) => [
                group.showsHead ? <EpicHeadRow key={`head:${group.key}`} head={group.head} columnCount={columnCount} /> : null,
                ...group.rows.map((row) => <TicketRow key={row.ticketId} row={row} showsEpicColumn={model.showsEpics} />),
              ])
              : (
                <tr className="bridge-ticket-empty">
                  <td colSpan={columnCount}>
                    <p><strong>{model.emptyText}</strong></p>
                    {model.narrows ? <p><button type="button" className="bridge-link-button" onClick={clear}>Clear search and filters</button></p> : null}
                  </td>
                </tr>
              )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
