/**
 * A forge in place laid out (SCREENS B1): the bar, with the forge's name, its condition and mono line, and its controls with Stop's question
 * as a popover under its button, a refusal under the bar,
 * and the frame area: "Opening <project>." until the Bridge is ready, the Bridge's frame, B3's callout, or why the forge cannot be shown
 * here. It takes no hooks: the states and the handlers come in as props, so a spec unfolds it whole.
 */
import { Button }              from 'design-system/Button';
import { ChoiceOption }        from 'design-system/ChoiceOption';
import type { ReactNode, Ref } from 'react';

import type { ForgeCommandBody, ForgeStopAgents } from '../../@types/CommandDocument.ts';
import { Callout }                                from '../../design-system/Callout.tsx';
import { ConditionDot }                           from '../../design-system/ConditionDot.tsx';
import { ConfirmPanel }                           from '../../design-system/ConfirmPanel.tsx';
import { OpenInNewTabGlyph }                      from '../../design-system/OpenInNewTabGlyph.tsx';
import { Refusal }                                from '../../design-system/Refusal.tsx';
import type { RefusalText }                       from '../../shared/utils/CommandFailureTextUtil.ts';
import type { StopQuestion }                      from '../../shared/utils/ForgeCommandTextUtil.ts';
import type {
  BarRefusal,
  ForgeBar,
  ForgeBarStatus,
  ForgeFrameArea,
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

const FIRST_CHOICE_LETTER_CODE = 'A'.charCodeAt(0);

function StopPopover({
  bar, question, commandIsOnItsWay, stopAgents, onCommand, onChooseStop, onCancelStop
}: { readonly question: StopQuestion } & Omit<ForgeBarControlsProps, 'stopIsOpen' | 'onOpenStop'>) {
  const choices = question.choices.length === 0 ? undefined : question.choices.map((choice, i) => (
    <ChoiceOption
      key={choice.agents}
      letter={String.fromCharCode(FIRST_CHOICE_LETTER_CODE + i)}
      label={choice.title}
      description={choice.consequence}
      chosen={choice.agents === stopAgents}
      variant="card"
      input={{
        type:           'radio',
        name:           `gaia-stop-${bar.trackerId}`,
        checked:        choice.agents === stopAgents,
        accessibleName: choice.title,
        // The package's option cannot be disabled, so a choice made while the Stop is on its way changes nothing.
        onChange:       () => {
          if (!commandIsOnItsWay) onChooseStop(choice.agents);
        },
      }}
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
        <Button label={pauseOrResume.label} emphasis={pauseOrResume.emphasis} compact disabled={!controlsMayAct} onPress={() => onCommand(pauseOrResume.command)} />
      )}
      {stop === null ? null : (
        <span className="gaia-forge-frame-stop">
          <Button label="Stop" compact disabled={!controlsMayAct} onPress={onOpenStop} />
          {stopIsOpen && controlsMayAct ? <StopPopover question={stop} {...props} /> : null}
        </span>
      )}
      <Button label={OPEN_IN_NEW_TAB_LABEL} leading={<OpenInNewTabGlyph />} compact disabled={commandIsOnItsWay} onPress={() => onCommand(bar.openInNewTab)} />
    </>
  );
}

export interface ForgeBarLayoutProps {
  /** The forge's name, or its tracker id until the fleet document names it. */
  readonly name:     string;
  /** `null` until the fleet document reports the forge. */
  readonly status:   ForgeBarStatus | null;
  readonly controls: ReactNode;
}

/** The bar heads the view, since a forge in place has no page title; its mono line keeps to one line, whole in its tooltip. */
export function ForgeBarLayout({ name, status, controls }: ForgeBarLayoutProps) {
  return (
    <header className="gaia-forge-frame-bar">
      <h1 className="gaia-forge-frame-bar-name">{name}</h1>
      {status === null ? null : (
        <span className="gaia-forge-frame-bar-status">
          <ConditionDot condition={status.condition} />
          <span className="gaia-forge-frame-bar-word">{status.word}</span>
          <span className="gaia-forge-frame-bar-line" title={status.text}>{status.text}</span>
        </span>
      )}
      <span className="gaia-forge-frame-bar-controls">{controls}</span>
    </header>
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
      <Button label={OPEN_IN_NEW_TAB_LABEL} leading={<OpenInNewTabGlyph />} compact disabled={commandIsOnItsWay} onPress={onOpenInNewTab} />
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
        actions={<Button label="Look again" compact onPress={onLookAgain} />}
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
