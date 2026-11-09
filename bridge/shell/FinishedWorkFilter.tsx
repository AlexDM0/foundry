/**
 * The finished-work filter at the tab bar's right end, a line such as "Hiding closed > 1 day" with its window in bold,
 * opening a menu of the spans (each with the count it would show), a since-date, what is hidden and "show all". The choice is the
 * board's, stored per board; Esc and a click outside close the menu.
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState
} from 'react';

import type { EpicRollupDocument, PageTicketDocument } from '../@types/BoardStateDocument.ts';
import type { PreferenceStore }                        from '../preferences/PreferenceStore.ts';
import {
  DEFAULT_FINISHED_WORK_CHOICE,
  FINISHED_WORK_CHOICE_NAME,
  FinishedWorkUtil,
  OFFERED_FINISHED_WORK_SPANS,
  type FinishedWorkChoice,
  type FinishedWorkSpan
} from '../utils/FinishedWorkUtil.ts';

/** The board's stored choice, written back on every change; with no store yet, the default, kept in memory. */
export function useFinishedWorkChoice(boardStore: PreferenceStore | null): [FinishedWorkChoice, (choice: FinishedWorkChoice) => void] {
  const [chosen, setChosen] = useState<FinishedWorkChoice | null>(null);
  const choice = chosen ?? FinishedWorkUtil.choiceFrom(boardStore?.readChoice(FINISHED_WORK_CHOICE_NAME) ?? null);
  const choose = useCallback((next: FinishedWorkChoice) => {
    boardStore?.writeChoice(FINISHED_WORK_CHOICE_NAME, next, DEFAULT_FINISHED_WORK_CHOICE);
    setChosen(next);
  }, [boardStore]);
  return [choice, choose];
}

const SPAN_SEGMENT_LABEL: Readonly<Record<FinishedWorkSpan, string>> = {
  '1h':  'hour',
  '1d':  'day',
  '6h':  '6 hours',
  '12h': '12 hours',
  '3d':  '3 days',
  'all': 'all',
};

const NOTHING_HIDDEN_TEXT = 'Nothing hidden';

export interface FinishedWorkFilterProps {
  readonly choice:               FinishedWorkChoice;
  readonly onChoice:             (choice: FinishedWorkChoice) => void;
  readonly tickets:              readonly PageTicketDocument[];
  readonly epics:                readonly EpicRollupDocument[];
  readonly nowEpochMilliseconds: number;
}

function FunnelIcon() {
  return (
    <svg className="bridge-filter-icon" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M2 3h12l-4.6 5.4V13l-2.8-1.4V8.4z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

export function FinishedWorkFilter({
  choice, onChoice, tickets, epics, nowEpochMilliseconds
}: FinishedWorkFilterProps) {
  const [menuIsOpen, setMenuIsOpen] = useState(false);
  const filter = useRef<HTMLDivElement | null>(null);
  const cutoff = FinishedWorkUtil.cutoffEpochMillisecondsOf(choice, nowEpochMilliseconds);
  const hiddenTicketCount = FinishedWorkUtil.finishedTicketsOf(tickets, cutoff).hiddenCount;
  const hiddenEpicCount = epics.length - FinishedWorkUtil.shownEpicsOf(epics, tickets, cutoff).length;
  const hiddenNote = FinishedWorkUtil.hiddenWorkNoteTextOf(hiddenTicketCount, hiddenEpicCount);
  const { lead, window } = FinishedWorkUtil.filterLineTextOf(choice, hiddenTicketCount + hiddenEpicCount);

  useEffect(() => {
    if (!menuIsOpen) return undefined;
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setMenuIsOpen(false);
    };
    const closeOnOutsideClick = (event: MouseEvent): void => {
      if (event.target instanceof Node && filter.current?.contains(event.target) !== true) setMenuIsOpen(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => {
      document.removeEventListener('keydown', closeOnEscape);
      document.removeEventListener('mousedown', closeOnOutsideClick);
    };
  }, [menuIsOpen]);

  const chooseSince = (calendarDate: string): void => {
    const since = FinishedWorkUtil.sinceChoiceFor(calendarDate);
    if (since !== null) onChoice(since);
  };
  const shownCountOf = (span: FinishedWorkSpan): number => (
    FinishedWorkUtil.finishedTicketsOf(tickets, FinishedWorkUtil.cutoffEpochMillisecondsOf(span, nowEpochMilliseconds)).shown.length
  );

  return (
    <div className="bridge-filter" ref={filter}>
      <button
        type="button"
        className="bridge-filter-line"
        aria-haspopup="dialog"
        aria-expanded={menuIsOpen}
        onClick={() => setMenuIsOpen((open) => !open)}
      >
        <FunnelIcon />
        <span className="bridge-filter-range" title={`Unfinished work always shows; work finished ${FinishedWorkUtil.windowPhraseOf(choice)} shows beside it`}>
          {lead}
          {window === '' ? null : <strong>{window}</strong>}
        </span>
        <span className="bridge-filter-caret" aria-hidden="true" />
      </button>
      {menuIsOpen ? (
        <div className="bridge-popover bridge-filter-menu" role="dialog" aria-label="Filters">
          <section className="bridge-filter-section">
            <div className="bridge-filter-section-head">
              <span className="bridge-range-label">Finished work</span>
              <span className="bridge-filter-scope">every tab</span>
            </div>
            <p className="bridge-filter-lede">Unfinished work always shows. Also show what finished in the last</p>
            <div className="bridge-segments" role="group" aria-label="Finished work">
              {OFFERED_FINISHED_WORK_SPANS.map((span) => (
                <button
                  key={span}
                  type="button"
                  aria-pressed={span === choice}
                  aria-label={FinishedWorkUtil.labelOf(span)}
                  onClick={() => onChoice(span)}
                >
                  {SPAN_SEGMENT_LABEL[span]}
                  <span className="bridge-segment-count">{shownCountOf(span)}</span>
                </button>
              ))}
            </div>
            <label className="bridge-filter-since">
              or since
              <input type="date" aria-label="Show finished work since" onChange={(event) => chooseSince(event.currentTarget.value)} />
            </label>
            <p className="bridge-filter-result">
              <span>{hiddenNote === '' ? NOTHING_HIDDEN_TEXT : hiddenNote}</span>
              {hiddenNote === '' ? null : <button type="button" className="bridge-link-button" onClick={() => onChoice('all')}>show all</button>}
            </p>
          </section>
          <div className="bridge-filter-foot">
            <button type="button" className="bridge-link-button" onClick={() => onChoice(DEFAULT_FINISHED_WORK_CHOICE)}>Reset filters</button>
            <span className="bridge-filter-scope">Esc closes</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
