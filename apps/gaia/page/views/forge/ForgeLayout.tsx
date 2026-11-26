/**
 * A forge in place laid out (`docs/design/screens.md` B1): the bar, with the forge's mark and name, its condition and line, and its controls with Stop's
 * question as a popover under its button and Open in new tab, or, for a forge Gaia cannot talk to, the
 * controls it cannot send disabled and an older forge's Update forge step by step; the bar's second line, the running and the newest
 * Hephaestus and Talos with a restart of each; a refusal under the bar; and, where no board shows, the versions notice of a forge Gaia cannot
 * talk to or why its board cannot be shown. While the forge's board is in setup the bar is its name, the setup step bar (or the repository's
 * path before a setup record opens), the condition's word while it is not live, and one quiet menu of the rare controls: Open in new tab,
 * Pause or Unpause, Stop with its question in place, and the restarts. It takes no hooks: the states and the handlers come in as props, so a
 * spec unfolds it whole.
 */
import type { ReactNode, RefObject } from 'react';

import type { ForgeCommandBody, ForgeStopAgents } from '../../@types/CommandDocument.ts';
import { ButtonGlyph }                            from '../../components/ButtonGlyph.tsx';
import { ConditionDot }                           from '../../components/ConditionDot.tsx';
import { Refusal }                                from '../../components/Refusal.tsx';
import { ForgeMark }                              from '../../lib/brand/BrandInterface.ts';
import {
  Button,
  ChoiceInput,
  ChoiceOption,
  ConfirmStrip,
  IconButton,
  Menu,
  MenuItem,
  MenuSeparator,
  MonoId,
  Popover,
  Text
} from '../../lib/design-system/DesignSystemInterface.ts';
import { VersionsPair }                            from '../../shared/VersionsPair.tsx';
import { VersionsText }                            from '../../shared/VersionsText.tsx';
import { ForgeCommandTextUtil, type StopQuestion } from '../../shared/utils/ForgeCommandTextUtil.ts';
import { ForgeVersionsTextUtil }                   from '../../shared/utils/ForgeVersionsTextUtil.ts';
import type {
  BarCannotTalk,
  BarCommand,
  BarLineSegment,
  BarRefusal,
  BarUpdateStep,
  BarVersionPair,
  BarVersions,
  ForgeBar,
  ForgeArea,
  ForgeBarStatus,
} from './ForgeModel.ts';

export interface ForgeBarControlsProps {
  readonly bar:               ForgeBar;
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

/** A forge that reports counts only, sleeps or lost its repository serves no board Gaia's relay reads. */
const CANNOT_SHOW_SENTENCE = 'Gaia cannot read this forge\'s board.';

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
 * Pause or Unpause, Stop with its question, and Open in new tab; a forge whose control contract Gaia does not know takes only
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

/** The bar's second line: the running and the newest Hephaestus and Talos, a pair a newer installed version marks, and a restart of each. */
export function RunningVersionsLine({ versions, commandIsOnItsWay, onCommand }: RunningVersionsLineProps) {
  const restartsMayAct = versions.restartsMayAct && !commandIsOnItsWay;
  const { restartHephaestus, restartTalos } = versions;
  return (
    <div className="gaia-forge-frame-running" role="group" aria-label="The running and the newest Hephaestus and Talos">
      {versions.pairs.map((pair) => (
        <span key={pair.component} className="gaia-forge-frame-running-pair" title={pair.title} data-newer={pair.newerIsInstalled ? '' : undefined}>
          <BarLine line={pair.line} />
        </span>
      ))}
      <Button label={restartHephaestus.label} emphasis={restartHephaestus.emphasis} compact disabled={!restartsMayAct} onPress={() => onCommand(restartHephaestus.command)} />
      <Button label={restartTalos.label} emphasis={restartTalos.emphasis} compact disabled={!restartsMayAct} onPress={() => onCommand(restartTalos.command)} />
    </div>
  );
}

export function ForgeBarControls(props: ForgeBarControlsProps) {
  const {
    bar, commandIsOnItsWay, stopIsOpen, stopAnchorRef, onCommand, onOpenStop, onCancelStop, onOpenInNewTab
  } = props;
  if (bar.cannotTalk !== null) return <CannotTalkControls {...props} cannotTalk={bar.cannotTalk} />;
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
      <OpenInNewTabButton disabled={commandIsOnItsWay} onPress={onOpenInNewTab} />
    </>
  );
}

export interface ForgeActionsMenuProps extends ForgeBarControlsProps {
  readonly menuIsOpen:       boolean;
  /** Opens or closes the menu; a close also puts Stop's question away. */
  readonly onMenuOpenChange: (isOpen: boolean) => void;
}

const FORGE_ACTIONS_LABEL = 'Forge actions';

/** The trigger's three dots, hidden since the trigger's name says what it opens. */
const MORE_GLYPH = '⋯';

/** A restart's item: its words, the running version as its description, and a mark while a newer version is installed. */
interface RestartItemProps {
  readonly restart:   BarCommand;
  readonly pair:      BarVersionPair | undefined;
  readonly onCommand: (command: ForgeCommandBody) => void;
}

function RestartItem({ restart, pair, onCommand }: RestartItemProps) {
  return (
    <MenuItem
      label={restart.label}
      {...(pair === undefined ? {} : { description: pair.line.map((segment) => segment.text).join(''), title: pair.title })}
      marked={pair?.newerIsInstalled ?? false}
      closing="return-focus"
      onChoose={() => onCommand(restart.command)}
    />
  );
}

/**
 * The setup bar's one menu: Open in new tab, Pause or Unpause, Stop, whose question opens in its place, and a restart of Hephaestus and of
 * Talos with the versions each runs; a control that cannot act now is left out, and a newer installed version marks the trigger.
 */
export function ForgeActionsMenu(props: ForgeActionsMenuProps) {
  const {
    bar, commandIsOnItsWay, stopIsOpen, onCommand, onOpenStop, onOpenInNewTab, menuIsOpen, onMenuOpenChange
  } = props;
  const controlsMayAct = bar.controlContractIsKnown && !commandIsOnItsWay;
  const { pauseOrUnpause, stop, versions } = bar;
  const restartsMayAct = versions !== null && versions.restartsMayAct && !commandIsOnItsWay;
  const pairOf = (component: BarVersionPair['component']) => versions?.pairs.find((pair) => pair.component === component);
  return (
    <Menu
      label={FORGE_ACTIONS_LABEL}
      trigger="icon"
      align="end"
      wide
      triggerContent={<span aria-hidden="true">{MORE_GLYPH}</span>}
      triggerName={`${FORGE_ACTIONS_LABEL} of ${bar.project}`}
      triggerTitle={FORGE_ACTIONS_LABEL}
      marked={versions?.pairs.some((pair) => pair.newerIsInstalled) ?? false}
      isOpen={menuIsOpen}
      onOpenChange={onMenuOpenChange}
    >
      <MenuItem label={OPEN_IN_NEW_TAB_LABEL} closing="return-focus" onChoose={onOpenInNewTab} />
      {pauseOrUnpause === null || !controlsMayAct
        ? null
        : <MenuItem label={pauseOrUnpause.label} closing="return-focus" onChoose={() => onCommand(pauseOrUnpause.command)} />}
      {stop === null || !controlsMayAct ? null : (
        stopIsOpen ? <StopQuestionStrip question={stop} {...props} /> : <MenuItem label="Stop" closing="stays-open" onChoose={onOpenStop} />
      )}
      {restartsMayAct ? (
        <>
          <MenuSeparator />
          <RestartItem restart={versions.restartHephaestus} pair={pairOf('Hephaestus')} onCommand={onCommand} />
          <RestartItem restart={versions.restartTalos} pair={pairOf('Talos')} onCommand={onCommand} />
        </>
      ) : null}
    </Menu>
  );
}

export interface ForgeSetupBarContentProps {
  readonly stepBar:   ReactNode;
  readonly root:      string;
  /** The forge's condition while it is not live, said by its dot and word, the whole reading in its tooltip; `null` while live. */
  readonly condition: ForgeBarStatus | null;
}

/**
 * What the setup bar shows after the forge's name: the setup step bar, or, before a setup record opens, the repository's path; then the
 * condition while the forge is not live.
 */
export function ForgeSetupBarContent({ stepBar, root, condition }: ForgeSetupBarContentProps) {
  return (
    <>
      {stepBar !== null && stepBar !== undefined
        ? <span className="gaia-forge-frame-bar-setup">{stepBar}</span>
        : <span className="gaia-forge-frame-bar-root"><Text typeRole="small" mono muted>{root}</Text></span>}
      {condition === null ? null : (
        <span className="gaia-forge-frame-bar-condition" title={condition.text}>
          <ConditionDot condition={condition.condition} />
          <span className="gaia-forge-frame-bar-word" data-condition={condition.condition === 'outdated' ? condition.condition : undefined}>{condition.word}</span>
        </span>
      )}
    </>
  );
}

/** The setup step bar on a line of its own under a forge's whole bar, so the setup's steps show whatever the bar holds. */
export function ForgeSetupStepRow({ stepBar }: { readonly stepBar: ReactNode }) {
  if (stepBar === null || stepBar === undefined) return null;
  return <div className="gaia-forge-frame-setup-row">{stepBar}</div>;
}

export interface ForgeBarLayoutProps {
  /** The forge's name, or its tracker id until the fleet document names it. */
  readonly name:     string;
  /** `null` until the fleet document reports the forge. */
  readonly status:   ForgeBarStatus | null;
  readonly controls: ReactNode;
  /** In the status's place while the forge's board is in setup (`ForgeSetupBarContent`); the bar is then the setup bar. */
  readonly setup?:   ReactNode;
}

/** The bar heads the view, since a forge in place has no page title; its line keeps to one line, the whole reading in its tooltip. */
export function ForgeBarLayout({
  name, status, controls, setup
}: ForgeBarLayoutProps) {
  return (
    <header className="gaia-forge-frame-bar" data-setup={setup === undefined ? undefined : ''}>
      <ForgeMark />
      <h1 className="gaia-forge-frame-bar-name">{name}</h1>
      {setup}
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

export interface ForgeAreaProps {
  /** Every area but the board, which the forge view draws itself. */
  readonly area: Exclude<ForgeArea, { kind: 'board' }>;
}

/** Why the area holds no board for a forge at a version this Gaia cannot talk to, with the versions pair. */
function CannotTalkNotice({ area }: { readonly area: Extract<ForgeArea, { kind: 'cannot-talk' }> }) {
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
    </div>
  );
}

function areaContentOf({ area }: ForgeAreaProps) {
  switch (area.kind) {
    case 'cannot-show':
      return (
        <div className="gaia-forge-frame-notice">
          <p className="gaia-forge-frame-notice-text">{CANNOT_SHOW_SENTENCE}</p>
        </div>
      );
    case 'cannot-talk':
      return <CannotTalkNotice area={area} />;
    case 'not-registered':
      return (
        <div className="gaia-forge-frame-notice">
          <p className="gaia-forge-frame-notice-text">The registry names no forge with this id.</p>
          <p className="gaia-forge-frame-notice-id"><MonoId text={area.trackerId} tone="muted" /></p>
        </div>
      );
  }
}

export function ForgeAreaLayout(props: ForgeAreaProps) {
  const { area } = props;
  const cannotTalk = area.kind === 'cannot-talk';
  return (
    <section
      className="gaia-forge-frame-area"
      aria-label={cannotTalk ? `${area.project}: Gaia cannot talk to this forge` : 'Why Gaia shows no board'}
      data-cannot-talk={cannotTalk ? '' : undefined}
    >
      {areaContentOf(props)}
    </section>
  );
}
