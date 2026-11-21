/**
 * A forge in place laid out (SCREENS B1): the bar, with the forge's mark and name, its condition and line, and its controls with Stop's
 * question as a popover under its button and Flint's brain between Stop and Open in new tab, or, for a forge Gaia cannot talk to, the
 * controls it cannot send disabled and an older forge's Update forge step by step; the bar's second line, the running and the newest
 * Overseer and Talos with a restart of each; a refusal under the bar; and the framed area:
 * "Opening <project>." until the Bridge is ready, the Bridge's frame, B3's callout, the versions notice of a forge Gaia cannot talk to, or
 * why the forge cannot be shown here. It takes no hooks: the states and the handlers come in as props, so a spec unfolds it whole.
 */
import { ForgeMark, type ForgeMarkProps } from 'brand/ForgeMark';
import { Button }                         from 'design-system/Button';
import { ChoiceInput, ChoiceOption }      from 'design-system/ChoiceOption';
import { ConfirmStrip }                   from 'design-system/ConfirmStrip';
import { IconButton }                     from 'design-system/IconButton';
import { MonoId }                         from 'design-system/MonoId';
import { Popover }                        from 'design-system/Popover';
import { Text }                           from 'design-system/Text';
import type { ReactNode, Ref, RefObject } from 'react';

import type { ForgeCommandBody, ForgeStopAgents }            from '../../@types/CommandDocument.ts';
import { BrainChip, type BrainChipProps, type BrainControl } from '../../design-system/BrainChip.tsx';
import { ButtonGlyph }                                       from '../../design-system/ButtonGlyph.tsx';
import { Callout }                                           from '../../design-system/Callout.tsx';
import { ConditionDot }                                      from '../../design-system/ConditionDot.tsx';
import { Refusal }                                           from '../../design-system/Refusal.tsx';
import { VersionsPair }                                      from '../../shared/VersionsPair.tsx';
import { VersionsText }                                      from '../../shared/VersionsText.tsx';
import type { RefusalText }                                  from '../../shared/utils/CommandFailureTextUtil.ts';
import { ForgeCommandTextUtil, type StopQuestion }           from '../../shared/utils/ForgeCommandTextUtil.ts';
import { ForgeVersionsTextUtil }                             from '../../shared/utils/ForgeVersionsTextUtil.ts';
import type {
  BarBrainShown,
  BarCannotTalk,
  BarLineSegment,
  BarMarkWake,
  BarRefusal,
  BarUpdateStep,
  BarVersions,
  ForgeBar,
  ForgeBarStatus,
  ForgeFrameArea,
} from './ForgeFrameModel.ts';

export interface ForgeBarControlsProps {
  readonly bar:               ForgeBar;
  /** What the brain's group shows, the forge's state or a wake refused here; `null` for a forge that reports no brain. */
  readonly brainShown:        BarBrainShown | null;
  /** While a command to this forge is on its way, every control of the bar waits for it. */
  readonly commandIsOnItsWay: boolean;
  readonly stopIsOpen:        boolean;
  /** Stop's wrapper, which holds its question's popover and counts as inside it. */
  readonly stopAnchorRef:     RefObject<HTMLSpanElement | null>;
  readonly stopAgents:        ForgeStopAgents;
  readonly onCommand:         (command: ForgeCommandBody) => void;
  readonly onOpenStop:        () => void;
  readonly onChooseStop:      (agents: ForgeStopAgents) => void;
  readonly onCancelStop:      () => void;
  /** Where an older forge's Update forge stands; only an older forge's bar shows it. */
  readonly updateStep:        BarUpdateStep;
  /** Dismisses a refused Update forge, or the restart a done one left pending. */
  readonly onDismissUpdate:   () => void;
  /** Opens this forge's board, at the route shown, in a browser tab of Gaia's own; it sends no command. */
  readonly onOpenInNewTab:    () => void;
}

const OPEN_IN_NEW_TAB_LABEL = 'Open in new tab';

const UPDATE_FORGE_LABEL = 'Update forge';

const TRY_AGAIN_LABEL = 'Try again';

const DISMISS_REFUSAL_LABEL = 'Dismiss this refusal';

const FIRST_CHOICE_LETTER_CODE = 'A'.charCodeAt(0);

function StopQuestionStrip({
  bar, question, commandIsOnItsWay, stopAgents, onCommand, onChooseStop, onCancelStop
}: { readonly question: StopQuestion } & Omit<ForgeBarControlsProps, 'stopIsOpen' | 'onOpenStop' | 'stopAnchorRef'>) {
  const choices = question.choices.length === 0 ? undefined : question.choices.map((choice, i) => (
    <ChoiceOption
      key={choice.agents}
      letter={String.fromCharCode(FIRST_CHOICE_LETTER_CODE + i)}
      label={choice.title}
      description={choice.consequence}
      chosen={choice.agents === stopAgents}
      variant="card"
      input={(
        <ChoiceInput
          type="radio"
          name={`gaia-stop-${bar.trackerId}`}
          checked={choice.agents === stopAgents}
          accessibleName={choice.title}
          disabled={commandIsOnItsWay}
          onChange={() => onChooseStop(choice.agents)}
        />
      )}
    />
  ));
  const confirmStop = () => onCommand({ kind: 'forge-stop', trackerId: bar.trackerId, agents: question.choices.length === 0 ? 'keep' : stopAgents });
  return (
    <ConfirmStrip
      label={question.label}
      question={question.question}
      {...(choices === undefined ? {} : { choices })}
      {...(question.consequence === null ? {} : { consequence: question.consequence })}
      tone="neutral"
      confirm={<Button label="Stop" emphasis="primary" compact disabled={commandIsOnItsWay} onPress={confirmStop} />}
      cancelLabel="Cancel"
      onCancel={onCancelStop}
    />
  );
}

/** The brain's state as the chip draws it, with Wake and Stop for this forge only where its control contract carries them. */
function brainChipPropsOf({
  bar, brainShown, commandIsOnItsWay, onCommand
}: Pick<ForgeBarControlsProps, 'bar' | 'brainShown' | 'commandIsOnItsWay' | 'onCommand'>): BrainChipProps | null {
  const { brain } = bar;
  if (brain === null || brainShown === null) return null;
  const controlSending = (kind: 'forge-brain-start' | 'forge-brain-stop'): BrainControl | null => (brain.controlsAreServed
    ? { onPress: () => onCommand({ kind, trackerId: bar.trackerId }), disabled: commandIsOnItsWay }
    : null);
  const wake = controlSending('forge-brain-start');
  switch (brainShown.state) {
    case 'off':
      return wake === null ? null : { state: 'off', wake };
    case 'starting':
      return { state: 'starting' };
    case 'running':
      return { ...brainShown, forgeName: bar.project, stop: controlSending('forge-brain-stop') };
    case 'refused':
      return { ...brainShown, wake };
    case 'ended':
      return brainShown;
  }
}

type UpdateForgeStepProps = Pick<ForgeBarControlsProps, 'bar' | 'updateStep' | 'commandIsOnItsWay' | 'onCommand' | 'onDismissUpdate'>;

/** Update forge, then "Updating the forge…", then the pending restart with Restart, or the forge's refusal in one line with Try again. */
function UpdateForgeStep({
  bar, updateStep, commandIsOnItsWay, onCommand, onDismissUpdate
}: UpdateForgeStepProps) {
  const { trackerId } = bar;
  const sendUpdate = (): void => onCommand({ kind: 'forge-update', trackerId });
  const { UPDATE_FORGE_TEXT } = ForgeVersionsTextUtil;
  const { RESTART_PENDING } = ForgeCommandTextUtil;
  switch (updateStep.step) {
    case 'idle':
      return <Button label={UPDATE_FORGE_LABEL} emphasis="primary" compact disabled={commandIsOnItsWay} onPress={sendUpdate} />;
    case 'pending':
      return (
        <span className="gaia-forge-frame-bar-note" role="status">
          <ConditionDot condition="starting" />
          {UPDATE_FORGE_TEXT.pending}
        </span>
      );
    case 'done':
      return (
        <>
          <span className="gaia-forge-frame-bar-restart" role="status">
            <strong className="gaia-forge-frame-bar-restart-word">{RESTART_PENDING.word}</strong>
            {` ${UPDATE_FORGE_TEXT.doneUnderAControl}`}
          </span>
          <Button
            label={RESTART_PENDING.restartLabel}
            emphasis="primary"
            compact
            disabled={commandIsOnItsWay}
            onPress={() => onCommand({ kind: 'forge-restart', trackerId })}
          />
          <IconButton glyph="close" accessibleName={RESTART_PENDING.dismissLabel} title={RESTART_PENDING.dismissLabel} onPress={onDismissUpdate} />
        </>
      );
    case 'refused':
      return (
        <>
          <span className="gaia-forge-frame-bar-update-refusal" role="alert" title={updateStep.wholeSentence}>
            {updateStep.lead}
            <span className="gaia-forge-frame-bar-update-refusal-code">{updateStep.code}</span>
            {`. ${updateStep.sentence}`}
          </span>
          <Button label={TRY_AGAIN_LABEL} compact disabled={commandIsOnItsWay} onPress={sendUpdate} />
          <IconButton glyph="close" accessibleName={DISMISS_REFUSAL_LABEL} title={DISMISS_REFUSAL_LABEL} onPress={onDismissUpdate} />
        </>
      );
  }
}

/** Open in new tab in the bar or a notice, compact, its arrow after its words. */
function OpenInNewTabButton({ disabled, onPress }: { readonly disabled: boolean; readonly onPress: () => void }) {
  return <Button label={OPEN_IN_NEW_TAB_LABEL} trailing={<ButtonGlyph name="arrow-out-of-square" />} compact disabled={disabled} onPress={onPress} />;
}

/** A control Gaia cannot send shows disabled; its title, on the span since a disabled button takes no pointer, names both versions. */
function UnsentControl({ label, cannotTalk }: { readonly label: string; readonly cannotTalk: BarCannotTalk }) {
  return (
    <span className="gaia-forge-frame-unsent" title={cannotTalk.unsentControlTitle}>
      <Button label={label} compact disabled />
    </span>
  );
}

/** For a forge Gaia cannot talk to: an older forge's Update forge, the controls Gaia cannot send, and Open in new tab. */
function CannotTalkControls(props: ForgeBarControlsProps & { readonly cannotTalk: BarCannotTalk }) {
  const { cannotTalk, commandIsOnItsWay, onOpenInNewTab } = props;
  return (
    <>
      {cannotTalk.verdict === 'older' ? <UpdateForgeStep {...props} /> : null}
      {cannotTalk.unsentControls.map((label) => <UnsentControl key={label} label={label} cannotTalk={cannotTalk} />)}
      <OpenInNewTabButton disabled={commandIsOnItsWay} onPress={onOpenInNewTab} />
    </>
  );
}

/**
 * Pause or Unpause, Stop with its question, Flint's brain, and Open in new tab; a forge whose control contract Gaia does not know takes only
 * the last, and a forge Gaia cannot talk to its own controls.
 */
function BarLineSegmentText({ segment }: { readonly segment: BarLineSegment }) {
  switch (segment.look) {
    case 'words':
      return segment.text;
    case 'figure':
      return <Text typeRole="small" mono>{segment.text}</Text>;
    case 'version':
      return <VersionsText text={[{ kind: 'version', text: segment.text }]} />;
  }
}

function BarLine({ line }: { readonly line: readonly BarLineSegment[] }) {
  return line.map((segment, i) => <BarLineSegmentText key={i} segment={segment} />);
}

export interface RunningVersionsLineProps {
  readonly versions:          BarVersions;
  /** While a command to this forge is on its way, both restarts wait for it, as the bar's controls do. */
  readonly commandIsOnItsWay: boolean;
  readonly onCommand:         (command: ForgeCommandBody) => void;
}

/** The bar's second line: the running and the newest Overseer and Talos, a pair a newer installed version marks, and a restart of each. */
export function RunningVersionsLine({ versions, commandIsOnItsWay, onCommand }: RunningVersionsLineProps) {
  const restartsMayAct = versions.restartsMayAct && !commandIsOnItsWay;
  const { restartOverseer, restartTalos } = versions;
  return (
    <div className="gaia-forge-frame-running" role="group" aria-label="The running and the newest Overseer and Talos">
      {versions.pairs.map((pair) => (
        <span key={pair.component} className="gaia-forge-frame-running-pair" title={pair.title} data-newer={pair.newerIsInstalled ? '' : undefined}>
          <BarLine line={pair.line} />
        </span>
      ))}
      <Button label={restartOverseer.label} emphasis={restartOverseer.emphasis} compact disabled={!restartsMayAct} onPress={() => onCommand(restartOverseer.command)} />
      <Button label={restartTalos.label} emphasis={restartTalos.emphasis} compact disabled={!restartsMayAct} onPress={() => onCommand(restartTalos.command)} />
    </div>
  );
}

export function ForgeBarControls(props: ForgeBarControlsProps) {
  const {
    bar, commandIsOnItsWay, stopIsOpen, stopAnchorRef, onCommand, onOpenStop, onCancelStop, onOpenInNewTab
  } = props;
  if (bar.cannotTalk !== null) return <CannotTalkControls {...props} cannotTalk={bar.cannotTalk} />;
  const brainChip = brainChipPropsOf(props);
  const controlsMayAct = bar.controlContractIsKnown && !commandIsOnItsWay;
  const { pauseOrUnpause, stop } = bar;
  return (
    <>
      {pauseOrUnpause === null ? null : (
        <Button label={pauseOrUnpause.label} emphasis={pauseOrUnpause.emphasis} compact disabled={!controlsMayAct} onPress={() => onCommand(pauseOrUnpause.command)} />
      )}
      {stop === null ? null : (
        <span className="gaia-forge-frame-stop" ref={stopAnchorRef}>
          <Button label="Stop" trailing={<ButtonGlyph name="chevron-down" />} compact disabled={!controlsMayAct} onPress={onOpenStop} />
          {stopIsOpen && controlsMayAct ? (
            <Popover label={stop.label} role="dialog" isOpen onDismiss={onCancelStop} anchorRef={stopAnchorRef} placement="below-end" width="wide">
              <StopQuestionStrip question={stop} {...props} />
            </Popover>
          ) : null}
        </span>
      )}
      {brainChip === null ? null : <BrainChip {...brainChip} />}
      <OpenInNewTabButton disabled={commandIsOnItsWay} onPress={onOpenInNewTab} />
    </>
  );
}

export interface ForgeBarLayoutProps {
  /** The forge's name, or its tracker id until the fleet document names it. */
  readonly name:     string;
  /** `null` until the fleet document reports the forge. */
  readonly status:   ForgeBarStatus | null;
  /** The forge mark's title and double click, for Flint's brain; none before the fleet document reports a brain. */
  readonly mark:     ForgeMarkProps;
  readonly controls: ReactNode;
}

/** The mark wakes the brain by a double click, as Wake does, and like Wake not while a command to the forge is on its way. */
export function forgeMarkPropsOf(markWake: BarMarkWake, commandIsOnItsWay: boolean, onWake: () => void): ForgeMarkProps {
  return {
    ...(markWake.title === null ? {} : { title: markWake.title }),
    ...(markWake.wakesBrain && !commandIsOnItsWay ? { onDoubleClick: onWake } : {}),
  };
}

/** The bar heads the view, since a forge in place has no page title; its line keeps to one line, the whole reading in its tooltip. */
export function ForgeBarLayout({
  name, status, mark, controls
}: ForgeBarLayoutProps) {
  return (
    <header className="gaia-forge-frame-bar">
      <ForgeMark {...mark} />
      <h1 className="gaia-forge-frame-bar-name">{name}</h1>
      {status === null ? null : (
        <span className="gaia-forge-frame-bar-status">
          <ConditionDot condition={status.condition} />
          <span className="gaia-forge-frame-bar-word" data-condition={status.condition === 'outdated' ? status.condition : undefined}>{status.word}</span>
          <span className="gaia-forge-frame-bar-line" title={status.text}><BarLine line={status.line} /></span>
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
        refusedBy={refusal.refusedBy}
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
      <OpenInNewTabButton disabled={commandIsOnItsWay} onPress={onOpenInNewTab} />
    </div>
  );
}

/** Why the frame holds no Bridge for a forge at a version this Gaia cannot talk to, with the versions pair and Open in new tab. */
type CannotTalkNoticeProps = { readonly area: Extract<ForgeFrameArea, { kind: 'cannot-talk' }> } & Pick<ForgeFrameAreaProps, 'onOpenInNewTab' | 'commandIsOnItsWay'>;

function CannotTalkNotice({ area, onOpenInNewTab, commandIsOnItsWay }: CannotTalkNoticeProps) {
  const { notice, verdict } = area;
  return (
    <div className="gaia-forge-frame-versions-notice">
      <span className="gaia-forge-frame-versions-word" data-verdict={verdict}>
        <ConditionDot condition={verdict === 'older' ? 'outdated' : 'unreadable'} />
        {notice.word}
      </span>
      <Text typeRole="phase" element="h2">{notice.heading}</Text>
      <Text typeRole="lead" element="p" muted>{notice.sentence}</Text>
      <VersionsPair pair={area.pair} />
      <span className="gaia-forge-frame-versions-actions">
        <Button
          label={OPEN_IN_NEW_TAB_LABEL}
          trailing={<ButtonGlyph name="arrow-out-of-square" />}
          // An older forge's primary is Update forge in the bar; a newer one offers nothing but its own Bridge.
          emphasis={verdict === 'newer' ? 'primary' : 'quiet'}
          disabled={commandIsOnItsWay}
          onPress={onOpenInNewTab}
        />
      </span>
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
        <div className="gaia-forge-frame-notice" data-refused="">
          <div className="gaia-forge-frame-notice-refusal">
            <Refusal
              commandLabel="Open"
              refusedBy={shown.refusal.refusedBy}
              code={shown.refusal.code}
              sentence={shown.refusal.sentence}
              onTryAgain={onAskAgain}
              onDismiss={onLeave}
            />
          </div>
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
    case 'cannot-talk':
      return <CannotTalkNotice area={area} onOpenInNewTab={props.onOpenInNewTab} commandIsOnItsWay={props.commandIsOnItsWay} />;
    case 'not-registered':
      return (
        <div className="gaia-forge-frame-notice">
          <p className="gaia-forge-frame-notice-text">The registry names no forge with this id.</p>
          <p className="gaia-forge-frame-notice-id"><MonoId text={area.trackerId} tone="muted" /></p>
        </div>
      );
  }
}

export function ForgeFrameAreaLayout(props: ForgeFrameAreaProps) {
  const { area } = props;
  const cannotTalk = area.kind === 'cannot-talk';
  return (
    <section
      className="gaia-forge-frame-area"
      aria-label={cannotTalk ? `${area.project}: Gaia cannot frame its Bridge` : 'The forge\'s own Bridge'}
      data-cannot-talk={cannotTalk ? '' : undefined}
    >
      {areaContentOf(props)}
    </section>
  );
}
