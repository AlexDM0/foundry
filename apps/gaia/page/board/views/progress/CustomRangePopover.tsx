/**
 * The Custom… range's popover: the typed bounds with what each resolves to, the tick sizes, and applying or discarding them together. It
 * opens on the applied range's texts with From focused; Enter or Apply applies a readable draft, Esc or Cancel discards it and hands the
 * focus back, and a click or focus outside discards it.
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
  Button,
  MicroCapsLabel,
  SegmentedControl,
  useDismissal
} from '../../../lib/design-system/DesignSystemInterface.ts';

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

const TICK_CHOICES: readonly (number | null)[] = [null, ...TICK_MINUTE_CHOICES];

const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 1440;

/** A tick choice as its segment's value: the automatic choice, or its minutes. */
function tickChoiceValueOf(tickMinutes: number | null): string {
  return tickMinutes === null ? AUTOMATIC_TICK_CHOICE : String(tickMinutes);
}

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
    <div className="board-range-field">
      <MicroCapsLabel text={label} element="label" htmlFor={inputElementId} />
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
      <span className="board-range-resolved" id={resolvedElementId} aria-live="polite" title={line.title} data-invalid={line.boundIsInvalid ? '' : undefined}>
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

  useDismissal({
    isOpen:      true,
    insideRefs:  [popoverRef],
    onDismiss:   (reason) => onClose(reason === 'escape'),
    escapePhase: 'capture',
  });

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
    <div ref={popoverRef} className="board-range-popover" role="dialog" aria-labelledby={titleElementId}>
      <p className="board-range-popover-title" id={titleElementId}>Custom range</p>
      <BoundField label="From" text={fromText} line={fromLine} inputRef={fromInputRef} placeholder={EMPTY_FROM_BOUND_TEXT} onText={setFromText} onKeyDown={applyOnEnter} />
      <BoundField label="To" text={toText} line={toLine} placeholder={EMPTY_TO_BOUND_TEXT} onText={setToText} onKeyDown={applyOnEnter} />
      <p className="board-range-hint">
        A time (<code>2026-09-18 13:05</code>, ISO), <code>start</code>, <code>now</code>, or back from now: <code>-2h</code>, <code>-30m</code>,{' '}
        <code>-1d</code>.
      </p>
      <div className="board-range-ticks">
        <MicroCapsLabel text="Ticks" id={ticksLabelElementId} />
        <SegmentedControl
          labelledBy={ticksLabelElementId}
          mono
          options={TICK_CHOICES.map((choice) => ({ value: tickChoiceValueOf(choice), label: tickLabelOf(choice) }))}
          selected={tickChoiceValueOf(tickMinutes)}
          onSelect={(value) => setTickMinutes(TICK_CHOICES.find((choice) => tickChoiceValueOf(choice) === value) ?? null)}
        />
      </div>
      <div className="board-range-actions">
        <Button label="Cancel" onPress={() => onClose(true)} />
        <Button label="Apply" emphasis="primary" disabled={!verdict.draftIsApplicable} onPress={applyDraft} />
      </div>
    </div>
  );
}
