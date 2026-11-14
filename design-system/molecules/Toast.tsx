/**
 * A short notice that leaves by itself: a title, a line of text, an optional check that draws itself, and a bar that runs down while it
 * shows. `onExpired` comes when the bar's animation ends; under reduced motion nothing moves and it comes from `expiryTimer` after the
 * same `--toast-duration`. A pointer over the toast or the focus in it pauses the bar; under reduced motion a pause starts the timer again
 * on its end, so a reader never loses the notice while reading it.
 */
import {
  useEffect,
  useRef,
  useState,
  type FocusEvent
} from 'react';

/** Calls `onEnd` once after `milliseconds`, unless the returned function is called first. */
export type ToastExpiryTimer = (milliseconds: number, onEnd: () => void) => () => void;

const BROWSER_EXPIRY_TIMER: ToastExpiryTimer = (milliseconds, onEnd) => {
  const timer = setTimeout(onEnd, milliseconds);
  return () => clearTimeout(timer);
};

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
const TOAST_DURATION_PROPERTY = '--toast-duration';
/** The value of `--toast-duration` in `tokens.css`, for a document without the stylesheet. */
const TOAST_DURATION_FALLBACK_MILLISECONDS = 5000;
const MILLISECONDS_PER_SECOND = 1000;
const DURATION_PATTERN = /^(\d+(?:\.\d+)?)(ms|s)$/;

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

function toastDurationMillisecondsOf(element: HTMLElement | null): number {
  const match = element === null ? null : DURATION_PATTERN.exec(getComputedStyle(element).getPropertyValue(TOAST_DURATION_PROPERTY).trim());
  if (match === null) return TOAST_DURATION_FALLBACK_MILLISECONDS;
  const amount = Number(match[1]);
  return match[2] === 's' ? amount * MILLISECONDS_PER_SECOND : amount;
}

export interface ToastProps {
  readonly title:        string;
  readonly text:         string;
  readonly glyph?:       'check';
  readonly onExpired:    () => void;
  readonly expiryTimer?: ToastExpiryTimer;
}

export function Toast({
  title, text, glyph, onExpired, expiryTimer = BROWSER_EXPIRY_TIMER
}: ToastProps) {
  const toast = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [holdsFocus, setHoldsFocus] = useState(false);
  const isPaused = isHovered || holdsFocus;
  const latestOnExpired = useRef(onExpired);
  useEffect(() => {
    latestOnExpired.current = onExpired;
  });
  useEffect(() => {
    if (isPaused || !prefersReducedMotion()) return undefined;
    return expiryTimer(toastDurationMillisecondsOf(toast.current), () => latestOnExpired.current());
  }, [isPaused, expiryTimer]);
  const focusLeaves = (event: FocusEvent<HTMLDivElement>): void => {
    if (!(event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget))) setHoldsFocus(false);
  };
  return (
    <div
      ref={toast}
      className="design-system-toast"
      role="status"
      // A toast holds no control, so it takes the focus itself: a keyboard reader can then pause it.
      tabIndex={0}
      data-paused={isPaused ? '' : undefined}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocus={() => setHoldsFocus(true)}
      onBlur={focusLeaves}
    >
      <div className="design-system-toast-body">
        {glyph === 'check'
          ? (
            <span className="design-system-toast-check" aria-hidden="true">
              <svg viewBox="0 0 12 12"><path d="M2 6.5L5 9L10 3" /></svg>
            </span>
          )
          : null}
        <div className="design-system-toast-text">
          <strong className="design-system-toast-title">{title}</strong>
          <span className="design-system-toast-message">{text}</span>
        </div>
      </div>
      <span className="design-system-toast-track" aria-hidden="true">
        <span
          className="design-system-toast-timer"
          onAnimationEnd={(event) => {
            if (event.target === event.currentTarget) latestOnExpired.current();
          }}
        />
      </span>
    </div>
  );
}
