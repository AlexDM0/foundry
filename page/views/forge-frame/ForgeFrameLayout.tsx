/**
 * A forge in place laid out (SCREENS B1): the bar's controls with Stop's question as a popover under its button, a refusal under the bar,
 * and the frame area: "Opening <project>." until the Bridge is ready, the Bridge's frame, B3's callout, or why the forge cannot be shown
 * here. It takes no hooks: the states and the handlers come in as props, so a spec unfolds it whole.
 */
import type { Ref } from 'react';

import type { ForgeCommandBody, ForgeStopAgents } from '../../@types/CommandDocument.ts';
import { Button }                                 from '../../design-system/Button.tsx';
import { Callout }                                from '../../design-system/Callout.tsx';
import { ChoiceOption }                           from '../../design-system/ChoiceOption.tsx';
import { ConditionDot }                           from '../../design-system/ConditionDot.tsx';
import { ConfirmPanel }                           from '../../design-system/ConfirmPanel.tsx';
import { Refusal }                                from '../../design-system/Refusal.tsx';
import type { RefusalText }                       from '../../shared/utils/CommandFailureTextUtil.ts';
import type {
  BarRefusal,
  ForgeBar,
  ForgeFrameArea,
  StopQuestion,
} from './ForgeFrameModel.ts';

export interface ForgeBarControlsProps {
  readonly bar:               ForgeBar;
  /** While a command to this forge is on its way, every control of the bar waits for it. */
  readonly commandIsOnItsWay: boolean;
  readonly stopIsOpen:        boolean;
  readonly stopAgents:        ForgeStopAgents;
  readonly onCommand:         (command: ForgeCommandBody) => void;
  readonly onOpenStop:        () => void;
  readonly onChooseStop:      (agents: ForgeStopAgents) => void;
  readonly onCancelStop:      () => void;
}

const OPEN_IN_NEW_TAB_LABEL = 'Open in new tab';

function StopPopover({
  bar, question, commandIsOnItsWay, stopAgents, onCommand, onChooseStop, onCancelStop
}: { readonly question: StopQuestion } & Omit<ForgeBarControlsProps, 'stopIsOpen' | 'onOpenStop'>) {
  const choices = question.choices.length === 0 ? undefined : question.choices.map((choice) => (
    <ChoiceOption
      key={choice.agents}
      name={`gaia-stop-${bar.trackerId}`}
      title={choice.title}
      consequence={choice.consequence}
      chosen={choice.agents === stopAgents}
      onChoose={() => onChooseStop(choice.agents)}
      disabled={commandIsOnItsWay}
    />
  ));
  return (
    <div className="gaia-forge-frame-stop-popover">
      <ConfirmPanel
        label={question.label}
        question={question.question}
        {...(choices === undefined ? {} : { choices })}
        {...(question.consequence === null ? {} : { consequence: question.consequence })}
        confirmLabel="Stop"
        onConfirm={() => onCommand({ kind: 'forge-stop', trackerId: bar.trackerId, agents: question.choices.length === 0 ? 'keep' : stopAgents })}
        onCancel={onCancelStop}
        disabled={commandIsOnItsWay}
      />
    </div>
  );
}

/** Pause or Resume, Stop with its question, and Open in new tab; a forge whose control contract Gaia does not know takes only the last. */
export function ForgeBarControls(props: ForgeBarControlsProps) {
  const {
    bar, commandIsOnItsWay, stopIsOpen, onCommand, onOpenStop
  } = props;
  const controlsMayAct = bar.controlContractIsKnown && !commandIsOnItsWay;
  const { pauseOrResume, stop } = bar;
  return (
    <>
      {pauseOrResume === null ? null : (
        <Button label={pauseOrResume.label} emphasis={pauseOrResume.emphasis} disabled={!controlsMayAct} onPress={() => onCommand(pauseOrResume.command)} />
      )}
      {stop === null ? null : (
        <span className="gaia-forge-frame-stop">
          <Button label="Stop" disabled={!controlsMayAct} onPress={onOpenStop} />
          {stopIsOpen && controlsMayAct ? <StopPopover question={stop} {...props} /> : null}
        </span>
      )}
      <Button label={OPEN_IN_NEW_TAB_LABEL} icon="open-in-new-tab" disabled={commandIsOnItsWay} onPress={() => onCommand(bar.openInNewTab)} />
    </>
  );
}

export interface BarRefusalLineProps {
  readonly refusal:   BarRefusal;
  readonly onCommand: (command: ForgeCommandBody) => void;
  readonly onDismiss: () => void;
}

export function BarRefusalLine({ refusal, onCommand, onDismiss }: BarRefusalLineProps) {
  const { tryAgain } = refusal;
  return (
    <div className="gaia-forge-frame-refusal">
      <Refusal
        commandLabel={refusal.commandLabel}
        code={refusal.code}
        sentence={refusal.sentence}
        onDismiss={onDismiss}
        {...(tryAgain === null ? {} : { onTryAgain: () => onCommand(tryAgain) })}
      />
    </div>
  );
}

/** What the frame area shows of the session: still asking or loading, the Bridge, or why there is no frame. */
export type FrameAreaShown =
  | { readonly kind: 'opening' }
  | {
    readonly kind:          'frame';
    readonly frameUrl:      string;
    /** Keys the frame: a new session loads a fresh frame, which adds no entry to the browser's history. */
    readonly frameLoad:     number;
    readonly bridgeIsReady: boolean;
  }
  | { readonly kind: 'cannot-show' }
  | { readonly kind: 'unreachable' }
  | { readonly kind: 'refused'; readonly refusal: RefusalText };

export interface ForgeFrameAreaProps {
  readonly area:              ForgeFrameArea;
  /** For an area that frames the Bridge: what its session shows now. */
  readonly shown:             FrameAreaShown | null;
  readonly onFrameElement:    Ref<HTMLIFrameElement>;
  readonly onLookAgain:       () => void;
  readonly onAskAgain:        () => void;
  /** Dismissing why there is no frame goes back to the view Gaia came from. */
  readonly onLeave:           () => void;
  readonly onOpenInNewTab:    () => void;
  readonly commandIsOnItsWay: boolean;
}

function Opening({ project }: { readonly project: string }) {
  return <p className="gaia-forge-frame-opening" role="status">{`Opening ${project}.`}</p>;
}

function CannotShow({ onOpenInNewTab, commandIsOnItsWay }: Pick<ForgeFrameAreaProps, 'onOpenInNewTab' | 'commandIsOnItsWay'>) {
  return (
    <div className="gaia-forge-frame-notice">
      <p className="gaia-forge-frame-notice-text">This forge cannot be shown inside Gaia yet.</p>
      <Button label={OPEN_IN_NEW_TAB_LABEL} icon="open-in-new-tab" disabled={commandIsOnItsWay} onPress={onOpenInNewTab} />
    </div>
  );
}

function Unreachable({ area, onLookAgain }: { readonly area: Extract<ForgeFrameArea, { kind: 'frame' | 'unreachable' }>; readonly onLookAgain: () => void }) {
  const { callout } = area;
  return (
    <div className="gaia-forge-frame-notice">
      <Callout
        tone="error"
        dot={<ConditionDot condition="unreachable" />}
        title={area.project}
        word={callout.word}
        sentence={callout.sentence}
        {...(callout.machineLine === null ? {} : { machineLine: callout.machineLine })}
        actions={<Button label="Look again" onPress={onLookAgain} />}
      />
    </div>
  );
}

/** The frame is in the page from the first answer on, so the Bridge loads behind "Opening"; it shows once the Bridge says it is ready. */
interface FramedBridgeProps {
  readonly project:        string;
  readonly shown:          Extract<FrameAreaShown, { kind: 'frame' }>;
  readonly onFrameElement: Ref<HTMLIFrameElement>;
}

function FramedBridge({ project, shown, onFrameElement }: FramedBridgeProps) {
  return (
    <>
      {shown.bridgeIsReady ? null : <Opening project={project} />}
      <iframe
        key={shown.frameLoad}
        className="gaia-forge-frame-bridge"
        title={`The Bridge of ${project}`}
        src={shown.frameUrl}
        ref={onFrameElement}
        data-bridge-ready={shown.bridgeIsReady ? '' : undefined}
      />
    </>
  );
}

function SessionArea({
  area, shown, onFrameElement, onAskAgain, onLeave, onOpenInNewTab, commandIsOnItsWay
}: { readonly area: Extract<ForgeFrameArea, { kind: 'frame' }>; readonly shown: FrameAreaShown } & Omit<ForgeFrameAreaProps, 'area' | 'shown' | 'onLookAgain'>) {
  switch (shown.kind) {
    case 'opening':
      return <Opening project={area.project} />;
    case 'frame':
      return <FramedBridge project={area.project} shown={shown} onFrameElement={onFrameElement} />;
    case 'cannot-show':
      return <CannotShow onOpenInNewTab={onOpenInNewTab} commandIsOnItsWay={commandIsOnItsWay} />;
    case 'unreachable':
      return <Unreachable area={area} onLookAgain={onAskAgain} />;
    case 'refused':
      return (
        <div className="gaia-forge-frame-notice">
          <Refusal commandLabel="Open" code={shown.refusal.code} sentence={shown.refusal.sentence} onTryAgain={onAskAgain} onDismiss={onLeave} />
        </div>
      );
  }
}

function areaContentOf(props: ForgeFrameAreaProps) {
  const { area, shown, onLookAgain } = props;
  switch (area.kind) {
    case 'frame':
      return shown === null ? <Opening project={area.project} /> : <SessionArea {...props} area={area} shown={shown} />;
    case 'unreachable':
      return <Unreachable area={area} onLookAgain={onLookAgain} />;
    case 'cannot-show':
      return <CannotShow onOpenInNewTab={props.onOpenInNewTab} commandIsOnItsWay={props.commandIsOnItsWay} />;
    case 'not-registered':
      return (
        <div className="gaia-forge-frame-notice">
          <p className="gaia-forge-frame-notice-text">The registry names no forge with this id.</p>
          <p className="gaia-forge-frame-notice-id">{area.trackerId}</p>
        </div>
      );
  }
}

export function ForgeFrameAreaLayout(props: ForgeFrameAreaProps) {
  return <section className="gaia-forge-frame-area" aria-label="The forge's own Bridge">{areaContentOf(props)}</section>;
}
