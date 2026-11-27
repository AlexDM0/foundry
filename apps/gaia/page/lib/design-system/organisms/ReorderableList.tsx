/**
 * A list whose rows the user reorders by the grip at each row's start, only inside its band. Space or Enter grabs and drops a row, the up and
 * down arrows move it and Esc puts it back; a pointer drag slides the passed rows aside and marks the landing with a line. A polite live region
 * speaks each move, and `onReorder` fires once on a drop that moved the row.
 */
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode
} from 'react';

import { ReorderIndexUtil, type RowBox } from '../utils/ReorderIndexUtil.ts';

export interface ReorderableItem {
  readonly key:       string;
  readonly content:   ReactNode;
  /** The grip's accessible name, such as "Move lint, position 2 of 4". */
  readonly grabLabel: string;
  /** The run of rows this row reorders among; neighbouring rows of one band stay together, before or after the next band. */
  readonly band?:     string;
  /** The row stays drawn but faded, its grip with it, such as a row marked for removal. */
  readonly faded?:    boolean;
}

export interface ReorderableListProps {
  /** The list's accessible name. */
  readonly label:        string;
  readonly items:        readonly ReorderableItem[];
  readonly onReorder:    (fromIndex: number, toIndex: number) => void;
  /** The words the live region speaks when the row at `fromIndex` now stands at `toIndex`. */
  readonly announce:     (fromIndex: number, toIndex: number) => string;
  /** The rows' boxes, in item order, measured once when a pointer drag starts; the list reads them from the page without it. */
  readonly measureRows?: () => readonly RowBox[];
}

/** The rows' keys, in order, when the drag began; a drag whose list has changed since then no longer holds, and ends unapplied. */
interface DragStart {
  readonly keysAtGrab: readonly string[];
}

interface KeyboardDrag extends DragStart {
  readonly kind:      'keyboard';
  readonly fromIndex: number;
  readonly toIndex:   number;
}

interface PointerDrag extends DragStart {
  readonly kind:      'pointer';
  readonly fromIndex: number;
  readonly toIndex:   number;
  readonly pointerId: number;
  /** The grip holding the pointer capture, released when the drag ends. */
  readonly grip:      HTMLButtonElement;
  readonly startY:    number;
  readonly offsetY:   number;
  readonly rowBoxes:  readonly RowBox[];
}

type Drag = KeyboardDrag | PointerDrag;

const GRAB_KEYS: readonly string[] = [' ', 'Enter'];
const STEP_BY_KEY: Readonly<Record<string, number>> = { ArrowUp: -1, ArrowDown: 1 };
const PRIMARY_BUTTON = 0;

function pixels(value: number): string {
  return `${value}px`;
}

function keysAreUnchanged(keysAtGrab: readonly string[], keys: readonly string[]): boolean {
  return keysAtGrab.length === keys.length && keysAtGrab.every((key, index) => key === keys[index]);
}

/** The grip's six dots, two columns of three. */
function GripGlyph() {
  return (
    <svg viewBox="0 0 8 12" aria-hidden="true">
      <circle cx="2" cy="2" r="1.1" />
      <circle cx="6" cy="2" r="1.1" />
      <circle cx="2" cy="6" r="1.1" />
      <circle cx="6" cy="6" r="1.1" />
      <circle cx="2" cy="10" r="1.1" />
      <circle cx="6" cy="10" r="1.1" />
    </svg>
  );
}

export function ReorderableList({
  label, items, onReorder, announce, measureRows
}: ReorderableListProps) {
  const [storedDrag, setDrag] = useState<Drag | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const rowElements = useRef(new Map<string, HTMLLIElement>());
  const gripElements = useRef(new Map<string, HTMLButtonElement>());
  /** The grip a keyboard grab holds the focus on, up to the render after its drop, while the rows around it move in the page. */
  const keyKeepingFocus = useRef<string | null>(null);
  const bands = items.map((item) => item.band);
  const keys = items.map((item) => item.key);
  const drag = storedDrag !== null && keysAreUnchanged(storedDrag.keysAtGrab, keys) ? storedDrag : null;
  if (storedDrag !== null && drag === null) setDrag(null);

  useLayoutEffect(() => {
    const key = keyKeepingFocus.current;
    const grip = key === null ? undefined : gripElements.current.get(key);
    if (grip !== undefined && document.activeElement !== grip) grip.focus();
    if (drag === null) keyKeepingFocus.current = null;
  });

  const cancel = (current: Drag): void => {
    setDrag(null);
    if (current.toIndex !== current.fromIndex) setAnnouncement(announce(current.fromIndex, current.fromIndex));
  };

  useEffect(() => {
    if (drag?.kind !== 'pointer') return undefined;
    const cancelOnEscape = (event: globalThis.KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      if (drag.grip.hasPointerCapture(drag.pointerId)) drag.grip.releasePointerCapture(drag.pointerId);
      setDrag(null);
      if (drag.toIndex !== drag.fromIndex) setAnnouncement(announce(drag.fromIndex, drag.fromIndex));
    };
    document.addEventListener('keydown', cancelOnEscape, true);
    return () => {
      document.removeEventListener('keydown', cancelOnEscape, true);
    };
  }, [drag, announce]);

  const moveTo = (current: Drag, toIndex: number): void => {
    if (toIndex === current.toIndex) return;
    setDrag({ ...current, toIndex });
    setAnnouncement(announce(current.fromIndex, toIndex));
  };

  const drop = (current: Drag): void => {
    setDrag(null);
    if (current.toIndex !== current.fromIndex) onReorder(current.fromIndex, current.toIndex);
  };

  const keyDownOnGrip = (index: number, event: KeyboardEvent<HTMLButtonElement>): void => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (drag === null) {
      if (!GRAB_KEYS.includes(event.key)) return;
      event.preventDefault();
      keyKeepingFocus.current = items[index]?.key ?? null;
      setDrag({
        kind: 'keyboard', fromIndex: index, toIndex: index, keysAtGrab: keys
      });
      return;
    }
    if (drag.kind !== 'keyboard') return;
    if (index !== drag.fromIndex) {
      cancel(drag);
      return;
    }
    if (GRAB_KEYS.includes(event.key)) {
      event.preventDefault();
      drop(drag);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      cancel(drag);
    } else if (Object.hasOwn(STEP_BY_KEY, event.key)) {
      event.preventDefault();
      moveTo(drag, ReorderIndexUtil.clampedToBand(bands, drag.fromIndex, drag.toIndex + (STEP_BY_KEY[event.key] ?? 0)));
    }
  };

  const blurOfGrip = (event: FocusEvent<HTMLButtonElement>): void => {
    if (event.relatedTarget === null) return;
    keyKeepingFocus.current = null;
    if (drag?.kind === 'keyboard') cancel(drag);
  };

  const measuredRowBoxes = (): readonly RowBox[] => {
    if (measureRows !== undefined) return measureRows();
    return items.map((item) => {
      const box = rowElements.current.get(item.key)?.getBoundingClientRect();
      return { top: box?.top ?? 0, height: box?.height ?? 0 };
    });
  };

  const pointerDownOnGrip = (index: number, event: PointerEvent<HTMLButtonElement>): void => {
    if (drag !== null || event.button !== PRIMARY_BUTTON) return;
    const grip = event.currentTarget;
    grip.setPointerCapture(event.pointerId);
    setDrag({
      kind:       'pointer',
      fromIndex:  index,
      toIndex:    index,
      pointerId:  event.pointerId,
      grip,
      startY:     event.clientY,
      offsetY:    0,
      rowBoxes:   measuredRowBoxes(),
      keysAtGrab: keys
    });
  };

  const pointerMoveOnGrip = (event: PointerEvent<HTMLButtonElement>): void => {
    if (drag?.kind !== 'pointer' || event.pointerId !== drag.pointerId) return;
    const landingIndex = ReorderIndexUtil.dropIndexAt(event.clientY, drag.rowBoxes, drag.fromIndex);
    const toIndex = ReorderIndexUtil.clampedToBand(bands, drag.fromIndex, landingIndex);
    setDrag({ ...drag, offsetY: event.clientY - drag.startY, toIndex });
    if (toIndex !== drag.toIndex) setAnnouncement(announce(drag.fromIndex, toIndex));
  };

  const pointerUpOnGrip = (event: PointerEvent<HTMLButtonElement>): void => {
    if (drag?.kind !== 'pointer' || event.pointerId !== drag.pointerId) return;
    if (drag.grip.hasPointerCapture(drag.pointerId)) drag.grip.releasePointerCapture(drag.pointerId);
    drop(drag);
  };

  const pointerCancelOnGrip = (event: PointerEvent<HTMLButtonElement>): void => {
    if (drag?.kind === 'pointer' && event.pointerId === drag.pointerId) cancel(drag);
  };

  const displayedIndices = drag?.kind === 'keyboard'
    ? ReorderIndexUtil.reorderedIndicesOf(items.length, drag.fromIndex, drag.toIndex)
    : items.map((_item, index) => index);
  const pointerDrag = drag?.kind === 'pointer' ? drag : null;
  const dropLineOffset = pointerDrag === null ? null : ReorderIndexUtil.dropLineOffsetOf(pointerDrag.rowBoxes, pointerDrag.fromIndex, pointerDrag.toIndex);
  const listStyle = pointerDrag === null
    ? undefined
    : { '--reorder-slot-span': pixels(ReorderIndexUtil.slotSpanOf(pointerDrag.rowBoxes, pointerDrag.fromIndex)) } as CSSProperties;

  return (
    <div className="design-system-reorder-list" style={listStyle}>
      <ol aria-label={label}>
        {displayedIndices.map((index) => {
          const item = items[index];
          if (item === undefined) return null;
          const draggedBy = drag !== null && index === drag.fromIndex ? drag.kind : undefined;
          const shift = pointerDrag === null ? null : ReorderIndexUtil.shiftOf(index, pointerDrag.fromIndex, pointerDrag.toIndex);
          const rowStyle = draggedBy === 'pointer' && pointerDrag !== null ? { '--reorder-offset': pixels(pointerDrag.offsetY) } as CSSProperties : undefined;
          return (
            <li
              key={item.key}
              ref={(element) => {
                if (element === null) rowElements.current.delete(item.key);
                else rowElements.current.set(item.key, element);
              }}
              className="design-system-reorder-row"
              data-dragging={draggedBy}
              data-shifted={shift ?? undefined}
              data-faded={item.faded === true ? '' : undefined}
              style={rowStyle}
            >
              <button
                ref={(element) => {
                  if (element === null) gripElements.current.delete(item.key);
                  else gripElements.current.set(item.key, element);
                }}
                type="button"
                className="design-system-reorder-grip"
                aria-label={item.grabLabel}
                onKeyDown={(event) => {
                  keyDownOnGrip(index, event);
                }}
                onBlur={blurOfGrip}
                onPointerDown={(event) => {
                  pointerDownOnGrip(index, event);
                }}
                onPointerMove={pointerMoveOnGrip}
                onPointerUp={pointerUpOnGrip}
                onPointerCancel={pointerCancelOnGrip}
              >
                <GripGlyph />
              </button>
              {item.content}
            </li>
          );
        })}
      </ol>
      {dropLineOffset === null
        ? null
        : <div className="design-system-reorder-drop-line" aria-hidden="true" style={{ top: pixels(dropLineOffset) }} />}
      <div className="design-system-reorder-announcer" aria-live="polite">{announcement}</div>
    </div>
  );
}
