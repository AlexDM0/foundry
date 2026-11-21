/**
 * The Tickets view: its title row (the count and what the finished-work choice hides), the toolbar card (search, the type, epic and status
 * chips, Group by epic), and the table card of `TicketsModel`, a click, Enter or Space on a row opening its row form in the detail panel.
 * The search and the chips live in the view; the grouping by epic is kept per board. The view is the tickets
 * habitat of Flint (`page/board/flint/UseTicketsHabitat.ts`).
 */

import {
  useMemo,
  useRef,
  useState,
  type AnimationEvent,
  type KeyboardEvent,
  type MouseEvent
} from 'react';

import type { BoardDocument } from '../../../@types/board/BoardDocument.ts';
import {
  Button,
  SegmentMeter,
  StateBadge,
  TextButton
} from '../../../lib/design-system/DesignSystemInterface.ts';
import { ChipFilterUtil }                        from '../../chips/ChipFilterUtil.ts';
import { CARD_EPIC_CHIP_LIMIT }                  from '../../chips/EpicChipUtil.ts';
import { EpicChips }                             from '../../chips/EpicChips.tsx';
import { FilterChipGroup }                       from '../../chips/FilterChipGroup.tsx';
import { PriorityMark, TypeMark, WaitingOnMark } from '../../chips/TicketMarks.tsx';
import { useTicketsHabitat }                     from '../../flint/UseTicketsHabitat.ts';
import type { PreferenceStore }                  from '../../preferences/PreferenceStore.ts';
import { useBoardHrefOf }                        from '../../shell/BoardRouteLinks.ts';
import { useChangedKeys }                        from '../../shell/ChangeHighlight.ts';
import { DetailRoute }                           from '../../shell/DetailRoute.ts';
import { useDetailRouting }                      from '../../shell/DetailRouting.ts';
import { useFinishedWorkWindow }                 from '../../shell/FinishedWorkWindow.ts';
import type { MatchPiece }                       from '../../utils/SearchMatchUtil.ts';
import { StateToneUtil }                         from '../../utils/StateToneUtil.ts';
import { ViewTitle }                             from '../ViewTitle.tsx';
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
  readonly board:      BoardDocument;
  /** The board's own preferences; `null` where none are kept. */
  readonly boardStore: PreferenceStore | null;
}

/** The id, branch and task columns are mono. */
const MONO_COLUMNS: readonly TicketSortKey[] = ['id', 'branch'];

/** A click on a link or button inside a row is that control's own, never the row's. */
const ROW_CONTROL_SELECTOR = 'a, button';

function MatchedText({ pieces }: { readonly pieces: readonly MatchPiece[] }) {
  return (
    <>
      {pieces.map((piece, index) => (piece.isMatch
        ? <mark key={index} className="board-match">{piece.text}</mark>
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

function GroupIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path d="M2.5 4h11M5 8h8.5M5 12h8.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
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

interface TicketRowProps {
  readonly row:             TicketRowModel;
  readonly showsEpicColumn: boolean;
  /** New or moved since the previous board: the row washes in its state's tint once. */
  readonly isChanged:       boolean;
  readonly onChangeShown:   (ticketId: string) => void;
}

function TicketRow({
  row, showsEpicColumn, isChanged, onChangeShown
}: TicketRowProps) {
  const routing = useDetailRouting();
  const hrefOf = useBoardHrefOf();
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
      className="board-ticket-row"
      data-ticket-id={row.ticketId}
      data-state={row.stateToken}
      data-state-tone={StateToneUtil.toneOf(row.stateToken)}
      data-selected={routing.isOpen(detailItem) ? '' : undefined}
      data-changed={isChanged ? '' : undefined}
      tabIndex={0}
      onClick={openRow}
      onKeyDown={openRowByKey}
      onAnimationEnd={(event: AnimationEvent<HTMLTableRowElement>) => {
        if (isChanged && event.target === event.currentTarget) onChangeShown(row.ticketId);
      }}
    >
      <td className="board-ticket-mono">
        <a href={routing.openerHrefOf(detailItem)}>{row.idText}</a>
      </td>
      <td className="board-ticket-title">
        <MatchedText pieces={row.titlePieces} />
        {row.priority === 'low' ? ' ' : null}
        {row.priority === null ? null : <PriorityMark priority={row.priority} />}
        {row.integration === null
          ? null
          : (
            <span className="board-integration-mark" title={row.integration.title}>
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
        <StateBadge {...StateToneUtil.lookOf(row.stateToken)} label={row.stateLabel} palette="quiet" fitted />
        {row.pauseText === null ? null : <span className="board-ticket-pause" title={row.pauseTitle ?? undefined}>{row.pauseText}</span>}
      </td>
      <td className="board-ticket-mono"><MatchedText pieces={row.branchPieces} /></td>
      <td className="board-ticket-mono">
        {row.task === null
          ? null
          : <a href={hrefOf({ tab: 'progress', item: DetailRoute.itemTextOf({ form: 'task-row', taskId: row.task.taskId }) })}>{row.task.labelText}</a>}
      </td>
    </tr>
  );
}

function EpicHeadRow({ head, columnCount }: { readonly head: TicketEpicHeadModel | null; readonly columnCount: number }) {
  const hrefOf = useBoardHrefOf();
  return (
    <tr className="board-ticket-epic-head" data-epic-slot={head === null ? undefined : String(head.epic.slot)}>
      <td colSpan={columnCount}>
        <div className="board-ticket-epic-line">
          {head === null
            ? <span className="board-ticket-epic-title">No epic</span>
            : (
              <>
                <a className="board-ticket-epic-title" href={hrefOf({ tab: 'epics', item: DetailRoute.epicItemTextOf(head.epic.key) })}>
                  <span className="board-epic-swatch" aria-hidden="true" />
                  {head.epic.title}
                </a>
                <div className="board-ticket-epic-meter"><SegmentMeter label={head.rollupLabel} segments={head.segments} /></div>
                <span className="board-ticket-epic-done">{head.doneText}</span>
                <span className="board-ticket-epic-facts">
                  {head.facts.map((fact) => (
                    <span key={fact.label} className="board-ticket-epic-fact">
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

export function TicketsView({ board, boardStore }: TicketsViewProps) {
  const finishedWorkWindow = useFinishedWorkWindow();
  const [changedTicketIds, clearChange] = useChangedKeys(board, TicketsModel.changedTicketIdsBetween);
  const searchInput = useRef<HTMLInputElement>(null);
  const viewElement = useRef<HTMLElement>(null);
  const boardTickets = board.page.tickets;
  const cuedTickets = useMemo(() => TicketsModel.cuedTicketsOf(boardTickets), [boardTickets]);
  useTicketsHabitat(viewElement, cuedTickets);
  const [view, setView] = useState<TicketView>(DEFAULT_TICKET_VIEW);
  const [groupedChoice, setGroupedChoice] = useState<boolean | null>(null);
  const groupedByEpic = groupedChoice ?? boardStore?.readChoice(TICKET_GROUPING_CHOICE_NAME) === TICKETS_GROUPED_BY_EPIC_CHOICE;
  const model = TicketsModel.ticketsModelOf(board, view, groupedByEpic, {
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

  const hiddenWorkText = TicketsModel.hiddenWorkTextOf(finishedWorkWindow.choice, model.narrows);

  return (
    <section className="board-tickets" aria-label="Tickets" ref={viewElement} data-flint-workplace="">
      <ViewTitle
        title="Tickets"
        lead={(
          <>
            <span aria-live="polite">{model.countText}</span>
            {hiddenWorkText === null ? '.' : `. ${hiddenWorkText}`}
          </>
        )}
      />
      <div className="board-tickets-toolbar" role="search">
        <div className="board-tickets-toolbar-line">
          <label className="board-search">
            <SearchIcon />
            <input
              ref={searchInput}
              type="search"
              className="board-search-input"
              aria-label="Search tickets"
              placeholder="Search id, title, epic, branch, group, text"
              spellCheck={false}
              autoComplete="off"
              value={shownView.searchText}
              onChange={(event) => setView({ ...shownView, searchText: event.target.value })}
            />
          </label>
          <FilterChipGroup label="Type" labelIsShown chips={model.typeChips} pressed={shownView.typeChips} countByChip={model.countByChip.type} onToggle={toggleType} />
          {model.showsEpics
            ? <FilterChipGroup label="Epic" labelIsShown chips={model.epicChips} pressed={shownView.epicChips} countByChip={model.countByChip.epic} onToggle={toggleEpic} />
            : null}
          {model.narrows ? <TextButton label="Clear search and filters" onPress={clear} /> : null}
        </div>
        <div className="board-tickets-toolbar-line">
          <FilterChipGroup
            label="Status"
            labelIsShown
            chips={model.statusChips}
            pressed={shownView.statusChips}
            countByChip={model.countByChip.status}
            onToggle={toggleStatus}
          />
          {model.showsEpics
            ? (
              <span className="board-tickets-grouping">
                <Button compact label="Group by epic" leading={<GroupIcon />} pressed={groupedByEpic} onPress={toggleGrouping} />
              </span>
            )
            : null}
        </div>
      </div>
      <div className="board-tickets-scroll">
        <table className="board-tickets-table">
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
                  <button type="button" className="board-sort" onClick={() => setView(TicketsModel.viewSortedBy(shownView, sortKey))}>{sortKey}</button>
                </th>
              ))}
              <th data-mono="">task</th>
            </tr>
          </thead>
          <tbody>
            {model.emptyText === null
              ? model.groups.map((group) => [
                group.showsHead ? <EpicHeadRow key={`head:${group.key}`} head={group.head} columnCount={columnCount} /> : null,
                ...group.rows.map((row) => (
                  <TicketRow
                    key={row.ticketId}
                    row={row}
                    showsEpicColumn={model.showsEpics}
                    isChanged={changedTicketIds.has(row.ticketId)}
                    onChangeShown={clearChange}
                  />
                )),
              ])
              : (
                <tr className="board-ticket-empty">
                  <td colSpan={columnCount}>
                    <p><strong>{model.emptyText}</strong></p>
                    {model.narrows ? <p><TextButton label="Clear search and filters" onPress={clear} /></p> : null}
                  </td>
                </tr>
              )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
