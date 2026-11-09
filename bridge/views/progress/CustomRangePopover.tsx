/**
 * The Custom… range's popover, as the static page's was: the typed bounds with what each resolves to,
 * the tick sizes, and applying or discarding them together. It opens on the applied range's texts with From focused; Enter or Apply
 * applies a readable draft, Esc or Cancel discards it and hands the focus back, and a click or focus outside discards it.
 */
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject
} from 'react';

import {
  customRangeDraftVerdict,
  customRangeOverride,
  EMPTY_FROM_BOUND_TEXT,
  EMPTY_TO_BOUND_TEXT,
  rangeBoundLine,
  type RangeBoundLine
} from './CustomRangeDraft.ts';
import { AUTOMATIC_TICK_CHOICE, TICK_MINUTE_CHOICES } from './constants/ProgressChart.ts';
import type { StoredViewOverride }                    from './utils/ChartPreferenceUtil.ts';

export interface CustomRangePopoverProps {
  readonly appliedOverride:   StoredViewOverride;
  readonly resolveBound:      (text: string) => number | null;
  readonly todayCalendarDate: string;
  readonly onApply:           (override: StoredViewOverride) => void;
  /** `returnFocus` is true when the viewer discarded the draft from inside it. */
  readonly onClose:           (returnFocus: boolean) => void;
}

const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 1440;

function tickLabelOf(tickMinutes: number | null): string {
  if (tickMinutes === null) return 'Auto';
  if (tickMinutes % MINUTES_PER_DAY === 0) return `${tickMinutes / MINUTES_PER_DAY}d`;
  if (tickMinutes % MINUTES_PER_HOUR === 0) return `${tickMinutes / MINUTES_PER_HOUR}h`;
  return `${tickMinutes}m`;
}

interface BoundFieldProps {
  readonly label:       string;
  readonly text:        string;
  readonly line:        RangeBoundLine;
  readonly placeholder: string;
  readonly inputRef?:   RefObject<HTMLInputElement | null>;
  readonly onText:      (text: string) => void;
  readonly onKeyDown:   (event: KeyboardEvent<HTMLInputElement>) => void;
}

/** One bound: its label, the typed text, and the moment it resolves to under it. */
function BoundField({
  label, text, line, placeholder, inputRef, onText, onKeyDown
}: BoundFieldProps) {
  const inputElementId = useId();
  const resolvedElementId = useId();
  return (
    <div className="bridge-range-field">
      <label className="bridge-range-label" htmlFor={inputElementId}>{label}</label>
      <input
        ref={inputRef}
        id={inputElementId}
        type="text"
        value={text}
        placeholder={placeholder}
        spellCheck={false}
        autoComplete="off"
        aria-invalid={line.boundIsInvalid}
        aria-describedby={resolvedElementId}
        onChange={(event) => onText(event.target.value)}
        onKeyDown={onKeyDown}
      />
      <span className="bridge-range-resolved" id={resolvedElementId} aria-live="polite" title={line.title} data-invalid={line.boundIsInvalid ? '' : undefined}>
        {line.text}
      </span>
    </div>
  );
}

export function CustomRangePopover({
  appliedOverride, resolveBound, todayCalendarDate, onApply, onClose
}: CustomRangePopoverProps) {
  const [fromText, setFromText] = useState(appliedOverride.fromText ?? EMPTY_FROM_BOUND_TEXT);
  const [toText, setToText] = useState(appliedOverride.toText ?? EMPTY_TO_BOUND_TEXT);
  const [tickMinutes, setTickMinutes] = useState(appliedOverride.tickMinutes);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const titleElementId = useId();
  const ticksLabelElementId = useId();
  const fromInputRef = useRef<HTMLInputElement | null>(null);
  const verdict = customRangeDraftVerdict(fromText, toText, resolveBound);
  const fromLine = rangeBoundLine(verdict.from, fromText, todayCalendarDate);
  const toLine = rangeBoundLine(verdict.to, toText, todayCalendarDate);

  useEffect(() => {
    fromInputRef.current?.focus();
    fromInputRef.current?.select();
  }, []);

  useEffect(() => {
    const closeOnEscape = (event: globalThis.KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onClose(true);
    };
    const closeOnLeaving = (event: Event): void => {
      if (event.target instanceof Node && popoverRef.current?.contains(event.target) !== true) onClose(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    document.addEventListener('pointerdown', closeOnLeaving);
    document.addEventListener('focusin', closeOnLeaving);
    return () => {
      document.removeEventListener('keydown', closeOnEscape);
      document.removeEventListener('pointerdown', closeOnLeaving);
      document.removeEventListener('focusin', closeOnLeaving);
    };
  }, [onClose]);

  const applyDraft = (): void => {
    if (!verdict.draftIsApplicable) return;
    onApply(customRangeOverride(fromText, toText, tickMinutes));
    onClose(true);
  };

  const applyOnEnter = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    applyDraft();
  };

  return (
    <div ref={popoverRef} className="bridge-range-popover" role="dialog" aria-labelledby={titleElementId}>
      <p className="bridge-range-popover-title" id={titleElementId}>Custom range</p>
      <BoundField label="From" text={fromText} line={fromLine} inputRef={fromInputRef} placeholder={EMPTY_FROM_BOUND_TEXT} onText={setFromText} onKeyDown={applyOnEnter} />
      <BoundField label="To" text={toText} line={toLine} placeholder={EMPTY_TO_BOUND_TEXT} onText={setToText} onKeyDown={applyOnEnter} />
      <p className="bridge-range-hint">
        A time (<code>2026-09-18 13:05</code>, ISO), <code>start</code>, <code>now</code>, or back from now: <code>-2h</code>, <code>-30m</code>,{' '}
        <code>-1d</code>.
      </p>
      <div className="bridge-range-ticks">
        <span className="bridge-range-label" id={ticksLabelElementId}>Ticks</span>
        <div className="bridge-segments" role="group" aria-labelledby={ticksLabelElementId}>
          {[null, ...TICK_MINUTE_CHOICES].map((choice) => (
            <button key={choice ?? AUTOMATIC_TICK_CHOICE} type="button" aria-pressed={choice === tickMinutes} onClick={() => setTickMinutes(choice)}>
              {tickLabelOf(choice)}
            </button>
          ))}
        </div>
      </div>
      <div className="bridge-range-actions">
        <button type="button" className="bridge-button" onClick={() => onClose(true)}>Cancel</button>
        <button type="button" className="bridge-button" data-primary="" disabled={!verdict.draftIsApplicable} onClick={applyDraft}>Apply</button>
      </div>
    </div>
  );
}
