/**
 * Passive text about the element it wraps, shown while that element is hovered or holds the focus and hidden from layout otherwise: it
 * hangs absolutely above or below, so it moves nothing. The trigger is described by it. Esc hides it until the pointer and the focus leave.
 */
import {
  cloneElement,
  useId,
  useState,
  type KeyboardEvent,
  type ReactElement
} from 'react';

export interface TooltipProps {
  /** A bold first line. */
  readonly title?:    string;
  readonly text:      string;
  readonly placement: 'above' | 'below';
  /** The element the tooltip describes; it gets `aria-describedby`, and must take the focus itself to show the tooltip from the keyboard. */
  readonly children:  ReactElement<{ 'aria-describedby'?: string }>;
}

export function Tooltip({
  title, text, placement, children
}: TooltipProps) {
  const tooltipElementId = useId();
  const [isDismissed, setIsDismissed] = useState(false);

  const hideOnEscape = (event: KeyboardEvent<HTMLSpanElement>): void => {
    if (event.key !== 'Escape' || isDismissed) return;
    // The first Esc hides the tooltip only; a dialog around it waits for the next one.
    event.preventDefault();
    setIsDismissed(true);
  };

  return (
    <span
      className="design-system-tooltip-trigger"
      data-dismissed={isDismissed ? '' : undefined}
      onKeyDown={hideOnEscape}
      onBlur={() => setIsDismissed(false)}
      onMouseLeave={() => setIsDismissed(false)}
    >
      {cloneElement(children, { 'aria-describedby': tooltipElementId })}
      <span className="design-system-tooltip" id={tooltipElementId} role="tooltip" data-placement={placement}>
        {title === undefined ? null : <strong className="design-system-tooltip-title">{title}</strong>}
        <span className="design-system-tooltip-text">{text}</span>
      </span>
    </span>
  );
}
