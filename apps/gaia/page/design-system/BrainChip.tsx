/**
 * Flint's brain in B1's bar (COMPONENT_LIBRARY 3.4, SCREENS B1), one of five states, each replacing the last: off (the Wake button),
 * starting (the starting dot and its note), running (the orange chip with the model, the effort, the countdown and the tokens, and Stop brain),
 * refused (the forge's refusal on one line, its sentence cut short before its code, then Wake again) and ended (a grey diamond and the
 * forge's sentence). It computes nothing from a clock: the countdown arrives as the text to show. A control is absent where the forge takes
 * no brain command, and disabled while its command is on its way.
 */
import { Button } from 'design-system/Button';

import { ConditionDot }   from './ConditionDot.tsx';
import type { RefusedBy } from './Refusal.tsx';
import { RoleDot }        from './RoleDot.tsx';

export type BrainState = 'off' | 'starting' | 'running' | 'refused' | 'ended';

/** A brain command's button: present only where the forge takes it, disabled while it is on its way. */
export interface BrainControl {
  readonly onPress:  () => void;
  readonly disabled: boolean;
}

export type BrainChipProps =
  | { readonly state: 'off'; readonly wake: BrainControl | null }
  | { readonly state: 'starting' }
  | {
    readonly state:     'running';
    readonly forgeName: string;
    /** The model and effort as the forge reports them, such as "haiku" and "low". */
    readonly model:     string;
    readonly effort:    string;
    /** The time left as already counted for display, such as "1:24"; the chip never reads a clock. */
    readonly countdown: string;
    /** The tokens as already shortened, such as "3.1k". */
    readonly tokens:    string;
    readonly stop:      BrainControl | null;
  }
  | { readonly state: 'refused'; readonly refusedBy: RefusedBy; readonly sentence: string; readonly code: string; readonly wake: BrainControl | null }
  | { readonly state: 'ended'; readonly sentence: string };

const WAKE_LABEL = 'Wake Flint\'s brain';

const STARTING_NOTE = 'Waking Flint\'s brain…';

const BRAIN_NAME = 'Flint\'s brain';

/** The bar's own Stop stops the forge beside it, so the brain's names what it stops. */
const STOP_LABEL = 'Stop brain';

const REFUSAL_LEAD_INS: Readonly<Record<RefusedBy, string>> = {
  forge: 'The forge refused: ',
  gaia:  'Gaia could not wake Flint\'s brain: ',
};

function WakeButton({ wake }: { readonly wake: BrainControl | null }) {
  if (wake === null) return null;
  return <Button label={WAKE_LABEL} leading={<RoleDot role="brain" />} compact disabled={wake.disabled} onPress={wake.onPress} />;
}

function RunningChip(props: Extract<BrainChipProps, { state: 'running' }>) {
  const { stop } = props;
  return (
    <>
      <span className="gaia-brain-chip">
        <RoleDot role="brain" />
        <span className="gaia-brain-chip-name">{BRAIN_NAME}</span>
        {` · ${props.model} ${props.effort} · `}
        <span className="gaia-brain-chip-figure">{props.countdown}</span>
        {' left · '}
        <span className="gaia-brain-chip-figure">{props.tokens}</span>
        {' tokens'}
      </span>
      {stop === null ? null : (
        <Button label={STOP_LABEL} accessibleName={`Stop Flint's brain on ${props.forgeName}`} compact disabled={stop.disabled} onPress={stop.onPress} />
      )}
    </>
  );
}

function BrainStateParts(props: BrainChipProps) {
  switch (props.state) {
    case 'off':
      return <WakeButton wake={props.wake} />;
    case 'starting':
      return (
        <span className="gaia-brain-chip-note" role="status">
          <ConditionDot condition="starting" />
          {STARTING_NOTE}
        </span>
      );
    case 'running':
      return <RunningChip {...props} />;
    case 'refused': {
      const leadIn = REFUSAL_LEAD_INS[props.refusedBy];
      const wholeRefusal = `${leadIn}${props.sentence} ${props.code}`;
      return (
        <>
          <span className="gaia-brain-chip-refusal" role="alert" title={wholeRefusal}>
            <span className="gaia-brain-chip-refusal-sentence">{`${leadIn}${props.sentence}`}</span>
            <span className="gaia-brain-chip-refusal-code">{props.code}</span>
          </span>
          <WakeButton wake={props.wake} />
        </>
      );
    }
    case 'ended':
      return (
        <span className="gaia-brain-chip-note">
          <RoleDot role="brain" ended />
          {props.sentence}
        </span>
      );
  }
}

export function BrainChip(props: BrainChipProps) {
  return (
    <span className="gaia-brain-chip-group" data-state={props.state}>
      <BrainStateParts {...props} />
    </span>
  );
}
