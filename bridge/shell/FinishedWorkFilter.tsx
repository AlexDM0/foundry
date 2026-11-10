/**
 * The filter line at the tab bar's right end, such as "Hiding closed > 1 day" with its window in bold and, on the Kanban, the pressed
 * epic, opening the filter menu: the spans (each with the count it would show), a since-day, what is hidden and "show all", then the
 * sections the selected tab adds. The choice is the board's, stored per board. Opening focuses the pressed span; Esc, a second click on the
 * line and Enter in the since field close it and hand the focus back to the line, a click or focus outside only closes it. Its Esc is
 * caught before the detail panel's, which then stays open: one Esc closes one thing.
 */
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode
} from 'react';

import type { EpicRollupDocument, PageTicketDocument } from '../@types/BoardStateDocument.ts';
import { TextButton }                                  from '../design-system/Button.tsx';
import { MicroCapsLabel }                              from '../design-system/MicroCapsLabel.tsx';
import { Popover }                                     from '../design-system/Popover.tsx';
import { SegmentedControl }                            from '../design-system/SegmentedControl.tsx';
import type { PreferenceStore }                        from '../preferences/PreferenceStore.ts';
import {
  DEFAULT_FINISHED_WORK_CHOICE,
  FINISHED_WORK_CHOICE_NAME,
  FinishedWorkUtil,
  OFFERED_FINISHED_WORK_SPANS,
  type FinishedWorkChoice,
  type FinishedWorkSpan
} from '../utils/FinishedWorkUtil.ts';
import { TimeUtil, type DurationUnits } from '../utils/TimeUtil.ts';

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

/** What the span buttons count: the finishing moment of each item the selected tab shows, open ones `null`. */
export interface FinishedWorkCount {
  readonly noun:            'ticket' | 'task';
  readonly finishedMoments: readonly (number | null)[];
}

/** The line's part after the window: the first pressed epic, "+N" for the others, with its swatch unless it is the no-epic row. */
export interface FilterLineEpic {
  readonly title: string;
  readonly slot:  number | null;
}

export interface FinishedWorkFilterProps {
  readonly choice:               FinishedWorkChoice;
  readonly onChoice:             (choice: FinishedWorkChoice) => void;
  readonly tickets:              readonly PageTicketDocument[];
  readonly epics:                readonly EpicRollupDocument[];
  readonly counted:              FinishedWorkCount;
  readonly nowEpochMilliseconds: number;
  /** The board's day and hour lengths, which word how far back a chosen day is; `null` before a board names them. */
  readonly durationUnits:        DurationUnits | null;
  /** The sections the selected tab adds after Finished work. */
  readonly tabSections?:         ReactNode;
  readonly lineEpic?:            FilterLineEpic | null;
  /** "Reset filters" calls it before it chooses the default window: the selected tab's own filters go back too. */
  readonly onResetTabFilters?:   () => void;
}

function FunnelIcon() {
  return (
    <svg className="bridge-filter-icon" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M2 3h12l-4.6 5.4V13l-2.8-1.4V8.4z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

export function FinishedWorkFilter({
  choice, onChoice, tickets, epics, counted, nowEpochMilliseconds, durationUnits, tabSections = null, lineEpic = null, onResetTabFilters
}: FinishedWorkFilterProps) {
  const [menuIsOpen, setMenuIsOpen] = useState(false);
  const [typedSince, setTypedSince] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const sinceFieldId = useId();
  const sinceResolvedId = useId();
  const finishedLabelId = useId();
  const filter = useRef<HTMLDivElement | null>(null);
  const line = useRef<HTMLButtonElement | null>(null);
  const spanButtons = useRef(new Map<FinishedWorkSpan, HTMLButtonElement>());
  const sinceField = useRef<HTMLInputElement | null>(null);

  const hiddenNoteOf = (shownChoice: FinishedWorkChoice): { readonly note: string; readonly itemCount: number } => {
    const cutoff = FinishedWorkUtil.cutoffEpochMillisecondsOf(shownChoice, nowEpochMilliseconds);
    const hiddenTicketCount = FinishedWorkUtil.finishedTicketsOf(tickets, cutoff).hiddenCount;
    const hiddenEpicCount = epics.length - FinishedWorkUtil.shownEpicsOf(epics, tickets, cutoff).length;
    return { note: FinishedWorkUtil.hiddenWorkNoteTextOf(hiddenTicketCount, hiddenEpicCount), itemCount: hiddenTicketCount + hiddenEpicCount };
  };
  const hidden = hiddenNoteOf(choice);
  const { lead, window } = FinishedWorkUtil.filterLineTextOf(choice, hidden.itemCount);
  const since = FinishedWorkUtil.sinceFieldReadingOf(typedSince, choice, nowEpochMilliseconds, durationUnits);
  const pressedSpan = OFFERED_FINISHED_WORK_SPANS.find((span) => span === choice) ?? null;

  const closeMenu = (returnsFocus: boolean): void => {
    setMenuIsOpen(false);
    if (returnsFocus) line.current?.focus();
  };

  const focusIsOwedOnOpen = useRef(false);
  const openMenu = (): void => {
    setTypedSince(null);
    focusIsOwedOnOpen.current = true;
    setMenuIsOpen(true);
  };
  // After the render that drew the menu: the pressed span, else the chosen day, else the first span takes the focus.
  useEffect(() => {
    if (!focusIsOwedOnOpen.current) return;
    focusIsOwedOnOpen.current = false;
    const pressedSpan = OFFERED_FINISHED_WORK_SPANS.find((span) => span === choice);
    if (pressedSpan !== undefined) spanButtons.current.get(pressedSpan)?.focus();
    else if (FinishedWorkUtil.sinceCalendarDateOf(choice) !== null) sinceField.current?.focus();
    else spanButtons.current.get(OFFERED_FINISHED_WORK_SPANS[0] ?? 'all')?.focus();
  });

  const choose = (next: FinishedWorkChoice): void => {
    setTypedSince(null);
    onChoice(next);
    setAnnouncement(FinishedWorkUtil.choiceAnnouncementOf(next, hiddenNoteOf(next).note));
  };
  const typeSince = (value: string): void => {
    const reading = FinishedWorkUtil.sinceFieldReadingOf(value, choice, nowEpochMilliseconds, durationUnits);
    const next = FinishedWorkUtil.sinceChoiceFor(value);
    if (next === null || reading.isInvalid) {
      setTypedSince(value);
      return;
    }
    choose(next);
  };
  const shownCountOf = (span: FinishedWorkSpan): number => (
    FinishedWorkUtil.shownFinishedCountOf(counted.finishedMoments, FinishedWorkUtil.cutoffEpochMillisecondsOf(span, nowEpochMilliseconds))
  );

  return (
    <div className="bridge-filter" ref={filter}>
      <button
        ref={line}
        type="button"
        className="bridge-filter-line"
        aria-haspopup="dialog"
        aria-expanded={menuIsOpen}
        onClick={() => (menuIsOpen ? closeMenu(true) : openMenu())}
      >
        <FunnelIcon />
        <span className="bridge-filter-range" title={`Unfinished work always shows; work finished ${FinishedWorkUtil.windowPhraseOf(choice)} shows beside it`}>
          {lead}
          {window === '' ? null : <strong>{window}</strong>}
        </span>
        {lineEpic === null
          ? null
          : (
            <span className="bridge-filter-epic">
              <span aria-hidden="true">·</span>
              {lineEpic.slot === null ? null : <span className="bridge-epic-swatch" data-epic-slot={String(lineEpic.slot)} />}
              <span className="bridge-filter-epic-name" title={lineEpic.title}>{lineEpic.title}</span>
            </span>
          )}
        <span className="bridge-filter-caret" aria-hidden="true" />
      </button>
      <Popover
        label="Filters"
        role="dialog"
        isOpen={menuIsOpen}
        onDismiss={(reason) => closeMenu(reason === 'escape')}
        anchorRef={filter}
        placement="below-end"
        width="menu"
      >
        <section className="bridge-filter-section">
          <div className="bridge-filter-section-head">
            <MicroCapsLabel text="Finished work" id={finishedLabelId} />
            <span className="bridge-filter-scope">every tab</span>
          </div>
          <p className="bridge-filter-lede">Unfinished work always shows. Also show what finished in the last</p>
          <SegmentedControl
            labelledBy={finishedLabelId}
            options={OFFERED_FINISHED_WORK_SPANS.map((span) => {
              const shownCount = shownCountOf(span);
              return {
                value:          span,
                label:          SPAN_SEGMENT_LABEL[span],
                count:          shownCount,
                accessibleName: FinishedWorkUtil.spanButtonLabelOf(span, shownCount, counted.noun),
              };
            })}
            selected={pressedSpan}
            onSelect={choose}
            optionRef={(span, button) => {
              if (button === null) spanButtons.current.delete(span);
              else spanButtons.current.set(span, button);
            }}
          />
          <div className="bridge-filter-since">
            <label htmlFor={sinceFieldId}>or since</label>
            <input
              ref={sinceField}
              id={sinceFieldId}
              type="date"
              max={TimeUtil.calendarDateOf(nowEpochMilliseconds)}
              value={since.value}
              data-chosen={since.isChosen ? '' : undefined}
              aria-invalid={since.isInvalid ? true : undefined}
              aria-describedby={sinceResolvedId}
              onChange={(event) => typeSince(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return;
                event.preventDefault();
                closeMenu(true);
              }}
            />
            <span className="bridge-filter-since-resolved" id={sinceResolvedId} aria-live="polite">{since.resolvedText}</span>
          </div>
          <p className="bridge-filter-result">
            <span>{hidden.note === '' ? NOTHING_HIDDEN_TEXT : hidden.note}</span>
            {hidden.note === ''
              ? null
              : (
                <TextButton
                  label="show all"
                  onPress={() => {
                    choose('all');
                    spanButtons.current.get('all')?.focus();
                  }}
                />
              )}
          </p>
        </section>
        {tabSections}
        <div className="bridge-filter-foot">
          <TextButton
            label="Reset filters"
            onPress={() => {
              onResetTabFilters?.();
              choose(DEFAULT_FINISHED_WORK_CHOICE);
            }}
          />
          <span className="bridge-filter-scope">Esc closes</span>
        </div>
      </Popover>
      <span className="bridge-visually-hidden" aria-live="polite">{announcement}</span>
    </div>
  );
}
