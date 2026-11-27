/**
 * The panel over the page while a command waits more than a second on the forge. It is a covering layer of the board's own, not a native
 * modal dialog, since the browser's top layer would sit above Flint's overlay and hide Flint in its slot.
 */
import { useLayoutEffect, useRef } from 'react';
import { createPortal }            from 'react-dom';

import { BusyIndicator, Text, View }                from '../../../lib/design-system/DesignSystemInterface.ts';
import { FLINT_SLOT_CUES }                          from '../../flint/FlintSlotCues.ts';
import { FlintSlotHabitat }                         from '../../flint/FlintSlotHabitat.tsx';
import { FLINT_SLOT_HABITATS }                      from '../../flint/FlintSlotHabitats.ts';
import { useLongWait, type CommandWaitExplanation } from './CommandWait.ts';

export interface CommandWaitShownProps {
  readonly isSending:   boolean;
  /** The control that waits, named in the busy ring's accessible name. */
  readonly controlName: string;
  /** What the panel says once the wait passes a second; absent, only the busy ring shows. */
  readonly wait?:       CommandWaitExplanation;
}

/** A control's wait on the forge: the busy ring at once, and the panel over the page once the wait passes a second, if the control names it. */
export function CommandWaitShown({ isSending, controlName, wait }: CommandWaitShownProps) {
  const waitHasLastedLong = useLongWait(isSending);
  return (
    <>
      {isSending ? <BusyIndicator shape="spinner" accessibleName={`${controlName}: waiting on the forge`} /> : null}
      {waitHasLastedLong && wait !== undefined ? <CommandWaitPanel title={wait.title} explanation={wait.explanation} /> : null}
    </>
  );
}

export function CommandWaitPanel({ title, explanation }: CommandWaitExplanation) {
  const panel = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    panel.current?.focus({ preventScroll: true });
  }, []);
  return createPortal(
    <div className="board-command-wait">
      <div className="board-command-wait-panel" role="dialog" aria-modal="true" aria-label={title} aria-busy="true" tabIndex={-1} ref={panel}>
        <FlintSlotHabitat habitat={FLINT_SLOT_HABITATS.commandWait} cue={FLINT_SLOT_CUES.FORGE_CHECKS} label={null} ground="plain" />
        <View gap="eight">
          <Text typeRole="title" element="h2">{title}</Text>
          <Text muted element="p">{explanation}</Text>
          <BusyIndicator shape="bar" accessibleName={title} />
        </View>
      </div>
    </div>,
    document.body
  );
}
