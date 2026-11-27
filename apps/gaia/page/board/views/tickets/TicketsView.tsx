/**
 * The Tickets view (`docs/design/tickets.md`): its title row, the In draft · Active · Finished segments with their counts and a search per
 * segment, and the shown segment's own layout. It opens on the segment its route names, else on In draft while something there waits on
 * User, else on the segment this viewer chose last on this forge, which a choice stores; an address that names a segment follows the
 * choice, so a reload, a copied link or Back never puts back a segment User left. The view is the tickets habitat of Flint
 * (`page/board/flint/UseTicketsHabitat.ts`).
 */
import { useMemo, useRef, useState } from 'react';

import type { BoardDocument }                                               from '../../../@types/board/BoardDocument.ts';
import { SegmentedControl, type SegmentOption }                             from '../../../lib/design-system/DesignSystemInterface.ts';
import { useTicketsHabitat }                                                from '../../flint/UseTicketsHabitat.ts';
import type { PreferenceStore }                                             from '../../preferences/PreferenceStore.ts';
import { useFinishedWorkWindow }                                            from '../../shared/FinishedWorkWindow.ts';
import { useBoardNavigation }                                               from '../../shared/routing/BoardRouteLinks.ts';
import type { RowMoment }                                                   from '../../shared/tickets/TicketRowFactsUtil.ts';
import { TICKET_SEGMENT_LABELS, TICKET_SEGMENTS, type TicketSegment }       from '../../shared/tickets/TicketSegmentUtil.ts';
import { FinishedWorkUtil }                                                 from '../../utils/FinishedWorkUtil.ts';
import { SearchMatchUtil }                                                  from '../../utils/SearchMatchUtil.ts';
import { ViewTitle }                                                        from '../ViewTitle.tsx';
import { ActiveSegment }                                                    from './ActiveSegment.tsx';
import { ActiveTicketsModelUtil }                                           from './ActiveTicketsModel.ts';
import { FinishedSegment }                                                  from './FinishedSegment.tsx';
import { FinishedTicketsModelUtil }                                         from './FinishedTicketsModel.ts';
import { InDraftModelUtil }                                                 from './InDraftModel.ts';
import { InDraftSegment }                                                   from './InDraftSegment.tsx';
import { DEFAULT_TICKET_SEGMENT, TICKET_SEGMENT_CHOICE_NAME, TicketsModel } from './TicketsModel.ts';

export interface TicketsViewProps {
  readonly board:      BoardDocument;
  /** The board's own preferences; `null` where none are kept. */
  readonly boardStore: PreferenceStore | null;
  /** The route's item: `in-draft`, `active` or `finished` opens that segment; any other item, such as a detail, names none. */
  readonly routeItem:  string | null;
}

const NO_SEARCH: Readonly<Record<TicketSegment, string>> = { 'in-draft': '', 'active': '', 'finished': '' };

function SearchIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="7" cy="7" r="4.8" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10.6 10.6 14 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function TicketsView({ board, boardStore, routeItem }: TicketsViewProps) {
  const finishedWorkWindow = useFinishedWorkWindow();
  const viewElement = useRef<HTMLElement>(null);
  const boardTickets = board.page.tickets;
  const cuedTickets = useMemo(() => TicketsModel.cuedTicketsOf(boardTickets), [boardTickets]);
  useTicketsHabitat(viewElement, cuedTickets);
  const [searchTexts, setSearchTexts] = useState(NO_SEARCH);
  const moment: RowMoment = { nowEpochMilliseconds: finishedWorkWindow.nowEpochMilliseconds, slices: board.limits };
  const inDraft = InDraftModelUtil.inDraftModelOf(board, moment, searchTexts['in-draft']);
  const active = ActiveTicketsModelUtil.activeTicketsModelOf(board, moment, searchTexts.active);
  const finished = FinishedTicketsModelUtil.finishedTicketsModelOf(board, moment, finishedWorkWindow.cutoffEpochMilliseconds, searchTexts.finished);
  const routedSegment = TicketsModel.segmentOfRouteItem(routeItem);
  const [segment, setSegment] = useState<TicketSegment>(() => TicketsModel.openingSegmentOf(
    routedSegment,
    inDraft.waitsOnUser,
    boardStore?.readChoice(TICKET_SEGMENT_CHOICE_NAME) ?? null,
  ));
  const [followedRouteSegment, setFollowedRouteSegment] = useState(routedSegment);
  if (routedSegment !== followedRouteSegment) {
    setFollowedRouteSegment(routedSegment);
    if (routedSegment !== null) setSegment(routedSegment);
  }
  const navigate = useBoardNavigation();
  const choose = (chosen: TicketSegment): void => {
    setSegment(chosen);
    boardStore?.writeChoice(TICKET_SEGMENT_CHOICE_NAME, chosen, DEFAULT_TICKET_SEGMENT);
    if (routedSegment !== null && routedSegment !== chosen) navigate({ tab: 'tickets', item: chosen });
  };
  const counts: Readonly<Record<TicketSegment, number>> = { 'in-draft': inDraft.draftCount, 'active': active.count, 'finished': finished.count };
  const options: SegmentOption<TicketSegment>[] = TICKET_SEGMENTS.map((value) => {
    const accented = value === 'in-draft' && inDraft.waitsOnUser;
    const label = TICKET_SEGMENT_LABELS[value];
    return {
      value,
      label,
      count:          counts[value],
      accentedCount:  accented,
      accessibleName: `${label}, ${counts[value]}${accented ? ', something waits on you' : ''}`,
    };
  });
  const searchText = searchTexts[segment];
  const searches = SearchMatchUtil.normalisedQueryOf(searchText) !== '';
  const searchName = `Search ${TICKET_SEGMENT_LABELS[segment].toLowerCase()}`;
  return (
    <section className="board-tickets" aria-label="Tickets" ref={viewElement} data-flint-workplace="">
      <ViewTitle title="Tickets" lead="Every ticket of this forge, from its first draft to its landing." />
      <div className="board-tickets-bar">
        <SegmentedControl accessibleName="Which tickets" options={options} selected={segment} onSelect={choose} />
        <label className="board-search">
          <SearchIcon />
          <input
            type="search"
            className="board-search-input"
            aria-label={searchName}
            placeholder={searchName}
            spellCheck={false}
            autoComplete="off"
            value={searchText}
            onChange={(event) => setSearchTexts({ ...searchTexts, [segment]: event.target.value })}
          />
        </label>
        {segment === 'in-draft' ? <span className="board-tickets-hint">Opens on In draft while something there waits on you.</span> : null}
      </div>
      {segment === 'in-draft' ? <InDraftSegment model={inDraft} searches={searches} /> : null}
      {segment === 'active' ? <ActiveSegment model={active} searches={searches} /> : null}
      {segment === 'finished'
        ? (
          <FinishedSegment
            model={finished}
            searches={searches}
            windowPhrase={FinishedWorkUtil.windowPhraseOf(finishedWorkWindow.choice)}
            onShowAll={finishedWorkWindow.showAll}
          />
        )
        : null}
    </section>
  );
}
