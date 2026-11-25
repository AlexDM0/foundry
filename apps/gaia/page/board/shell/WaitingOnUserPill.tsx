/**
 * The Waiting on User pill after the header's figures: rose while anything waits, neutral at zero so the header never moves, with a red dot
 * while anything is escalated. A click toggles the inbox popover under it; Esc closes it and hands the focus back to the pill, a pointer
 * or focus outside closes it, and so does following any link in it.
 */
import { useRef, useState }              from 'react';
import { type DismissalReason, Popover } from '../../lib/design-system/DesignSystemInterface.ts';

import { StateToneUtil }                          from '../utils/StateToneUtil.ts';
import type { TimestampSlices }                   from '../utils/TimeUtil.ts';
import type { QuestionNotifier }                  from '../views/questions/QuestionAlerts.ts';
import type { BoardClock }                        from './BoardClock.ts';
import { useEndPlacementOrStartWhenNarrow }       from './NarrowWindowPlacement.ts';
import { WaitingOnUserInbox }                     from './WaitingOnUserInbox.tsx';
import { WaitingOnUserModel, type WaitingOnUser } from './WaitingOnUserModel.ts';

export interface WaitingOnUserPillProps {
  readonly waiting:         WaitingOnUser;
  readonly clock:           BoardClock;
  readonly isLive:          boolean;
  readonly timestampSlices: TimestampSlices | null;
  readonly notifier:        QuestionNotifier;
}

const INBOX_LABEL = 'Waiting on User';

export function WaitingOnUserPill({
  waiting, clock, isLive, timestampSlices, notifier
}: WaitingOnUserPillProps) {
  const [isOpen, setIsOpen] = useState(false);
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const pillRef = useRef<HTMLButtonElement | null>(null);
  const inboxPlacement = useEndPlacementOrStartWhenNarrow();
  const dismiss = (reason: DismissalReason): void => {
    setIsOpen(false);
    if (reason === 'escape') pillRef.current?.focus();
  };
  return (
    <span ref={anchorRef} className="board-attention">
      <button
        ref={pillRef}
        type="button"
        className="board-attention-pill"
        data-state={waiting.total > 0 ? 'ready-for-review' : undefined}
        data-state-tone={waiting.total > 0 ? StateToneUtil.toneOf('ready-for-review') : undefined}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label={WaitingOnUserModel.pillAriaLabelOf(waiting)}
        onClick={() => setIsOpen((open) => !open)}
      >
        {waiting.escalatedCount > 0 ? <span className="board-attention-pill-dot" aria-hidden="true" /> : null}
        {INBOX_LABEL}
        <span aria-hidden="true">·</span>
        <span className="board-attention-pill-figure">{waiting.total}</span>
        <span className="board-attention-pill-caret" aria-hidden="true" />
      </button>
      <span className="board-attention-drop">
        <Popover label={INBOX_LABEL} role="dialog" isOpen={isOpen} onDismiss={dismiss} anchorRef={anchorRef} placement={inboxPlacement} width="inbox">
          <WaitingOnUserInbox
            waiting={waiting}
            clock={clock}
            isLive={isLive}
            timestampSlices={timestampSlices}
            notifier={notifier}
            onNavigate={() => setIsOpen(false)}
          />
        </Popover>
      </span>
    </span>
  );
}
