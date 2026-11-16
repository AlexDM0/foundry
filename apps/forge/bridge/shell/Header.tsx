/**
 * The header's rows: the title row (the Forge mark and wordmark, the project title, the state pill and its quiet details, then at its
 * right end the figures closed by the Waiting on User pill, the Overseer's compact controls and the theme button), the "Agents at work"
 * strip, and the tab bar, its tabs counting what waits on User, with whatever the shell puts at its right end. In a frame, `board.css`
 * keeps the tab bar alone. In setup, while the board has no readable pipeline, the header is the title row (the mark, the title, the
 * Setting up pill, the new-code notice, the theme button) over the setup step bar: no figures, no Waiting on User pill, no Overseer
 * controls, no activity strip and no tabs. Out of setup, a double click on Forge's mark wakes Flint's brain while the forge runs one that
 * sleeps, its refusal shown beside the brand.
 */

import { ForgeMark }                          from 'brand/ForgeMark';
import { Button }                             from 'design-system/Button';
import { ConfirmStrip }                       from 'design-system/ConfirmStrip';
import { CountBadge, type CountBadgeColours } from 'design-system/CountBadge';
import { Tabs, type LinkTabItem }             from 'design-system/Tabs';
import { Text }                               from 'design-system/Text';
import { useState, type ReactNode }           from 'react';

import { StateToneUtil }                                       from '../utils/StateToneUtil.ts';
import type { TimestampSlices }                                from '../utils/TimeUtil.ts';
import type { QuestionNotifier }                               from '../views/questions/QuestionAlerts.ts';
import { ActivityStrip }                                       from './ActivityStrip.tsx';
import type { BridgeClock }                                    from './BridgeClock.ts';
import { useChangedSinceMount }                                from './ChangedSinceMount.ts';
import { CommandButton }                                       from './CommandButton.tsx';
import { useControlCommand }                                   from './ControlCommandSender.ts';
import { HashRouter, type BridgeTab }                          from './HashRouter.ts';
import type { HeaderFigureLane, HeaderModel, HeaderStatistic } from './HeaderModel.ts';
import { SetupStepBar }                                        from './SetupStepBar.tsx';
import type { ThemeChoice }                                    from './ThemeBootstrap.ts';
import { ThemeButton }                                         from './ThemeButton.tsx';
import type {
  TabCount,
  TabCounts,
  TabCountTone,
  WaitingOnUser
} from './WaitingOnUserModel.ts';
import { WaitingOnUserPill } from './WaitingOnUserPill.tsx';

export interface HeaderProps {
  readonly project:          string;
  readonly model:            HeaderModel;
  readonly selectedTab:      BridgeTab;
  /** The tabs the board shows, in order. */
  readonly shownTabs:        readonly BridgeTab[];
  readonly themeChoice:      ThemeChoice;
  readonly onThemeChoice:    (choice: ThemeChoice) => void;
  /** While the event stream is down the strip's dots go quiet and its times stand still. */
  readonly activityIsLive:   boolean;
  /** A ticket detail or the question panel is open; it holds the page's one Flint slot, so the strip shows none. */
  readonly sidePanelIsOpen:  boolean;
  readonly clock:            BridgeClock;
  /** What the tab bar holds at its right end: the finished-work filter on a board tab. */
  readonly tabBarEnd?:       ReactNode;
  /** A figure pointing at a Kanban lane was followed; the link itself opens the tab. */
  readonly onShowLane?:      (lane: HeaderFigureLane) => void;
  /** `null` before the first board, which shows no pill. */
  readonly waitingOnUser:    WaitingOnUser | null;
  readonly tabCounts:        TabCounts;
  readonly questionNotifier: QuestionNotifier;
  /** The page's stamp slices the inbox shows full stamps by; `null` on a board that serves no page. */
  readonly timestampSlices:  TimestampSlices | null;
}

export const TAB_LABELS: Readonly<Record<BridgeTab, string>> = {
  kanban:    'Kanban',
  waves:     'Waves',
  progress:  'Progress',
  epics:     'Epics',
  tickets:   'Tickets',
  agents:    'Agents',
  questions: 'Questions',
  assistant: 'Assistant',
  intake:    'Intake',
  pipeline:  'Pipeline',
};

const COUNT_BADGE_OF_TONE: Readonly<Record<TabCountTone, CountBadgeColours & { readonly marked?: boolean }>> = {
  waiting:   { tone: 'state', stateTone: StateToneUtil.toneOf('ready-for-review') },
  escalated: { tone: 'error', marked: true },
  neutral:   { tone: 'neutral' },
};

const PRODUCT_WORDMARK = 'forge';

const FORGE_MARK_SIDE_PIXELS = 28;

const FLINT_BRAIN_START = { kind: 'flint-brain-start' } as const;

const FLINT_BRAIN_WAKE_HINT = 'Double-click to wake Flint\'s brain';

function StopOverseer() {
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return <Button label="Stop Overseer" compact onPress={() => setConfirming(true)} />;
  }
  return (
    <ConfirmStrip
      label="Confirm stopping the Overseer"
      question="Stop the Overseer?"
      consequence="Launches end until it is started again."
      tone="neutral"
      confirm={<CommandButton label="Confirm stop" command={{ kind: 'overseer-stop', now: false }} answeredWhileInstallHeld primary compact />}
      cancelLabel="Cancel"
      onCancel={() => setConfirming(false)}
    />
  );
}

/** Forge's mark from the brand package and the lowercase wordmark, the same on every screen. */
function ProductBrand() {
  return (
    <span className="bridge-brand">
      <ForgeMark sizePixels={FORGE_MARK_SIDE_PIXELS} />
      <span className="bridge-wordmark">{PRODUCT_WORDMARK}</span>
    </span>
  );
}

/** The brand whose mark wakes Flint's brain on a double click, as a Bridge control: never while controls may not act. */
function FlintBrainWakingBrand({ wakes }: { readonly wakes: boolean }) {
  const sender = useControlCommand(wakes ? FLINT_BRAIN_START : null, { answeredWhileInstallHeld: true });
  const markWakes = wakes && sender.enabled;
  return (
    <>
      <span className="bridge-brand">
        {markWakes
          ? <ForgeMark sizePixels={FORGE_MARK_SIDE_PIXELS} title={FLINT_BRAIN_WAKE_HINT} onDoubleClick={() => void sender.send()} />
          : <ForgeMark sizePixels={FORGE_MARK_SIDE_PIXELS} />}
        <span className="bridge-wordmark">{PRODUCT_WORDMARK}</span>
      </span>
      {sender.refusal === null ? null : <span className="bridge-refusal" role="status">{sender.refusal}</span>}
    </>
  );
}

/** Running is the orange pill with the live dot; every other state, setup among them, is the quiet pill. A new state's pill pops in. */
function StatusPill({ model }: { readonly model: HeaderModel }) {
  const hasChanged = useChangedSinceMount(model.statusToken);
  return (
    <span
      key={model.statusToken}
      className="bridge-status-pill"
      data-running={model.isRunning ? '' : undefined}
      data-status={model.statusToken}
      data-value-changed={hasChanged ? '' : undefined}
    >
      {model.isRunning ? <span className="bridge-status-dot" aria-hidden="true" /> : null}
      {model.statusLabel}
    </span>
  );
}

/** The usage windows and the new-code notice after the pill, one quiet line. */
function StatusDetails({ model }: { readonly model: HeaderModel }) {
  const usage = model.statusDetails.join(' · ');
  if (usage === '' && model.newCodeNotice === null) return null;
  return (
    <span className="bridge-status-details">
      {usage === '' ? null : <Text typeRole="small" subtle>{usage}</Text>}
      {usage === '' || model.newCodeNotice === null ? null : <span aria-hidden="true">·</span>}
      {model.newCodeNotice === null ? null : <span className="bridge-status-notice" role="status">{model.newCodeNotice}</span>}
    </span>
  );
}

function Statistic({ statistic, onShowLane }: { readonly statistic: HeaderStatistic; readonly onShowLane: ((lane: HeaderFigureLane) => void) | undefined }) {
  const hasChanged = useChangedSinceMount(statistic.figure);
  const parts = (
    <>
      <span key={statistic.figure} className="bridge-stat-figure" data-value-changed={hasChanged ? '' : undefined}>{statistic.figure}</span>
      <span className="bridge-stat-label">{statistic.label}</span>
    </>
  );
  const explanation = statistic.explanation ?? undefined;
  if (statistic.opensTab === null) return <span className="bridge-stat" title={explanation}>{parts}</span>;
  const { kanbanLane } = statistic;
  return (
    <a
      className="bridge-stat"
      href={HashRouter.fragmentOf({ tab: statistic.opensTab, item: null })}
      data-state={statistic.state ?? undefined}
      data-state-tone={StateToneUtil.optionalToneOf(statistic.state)}
      title={explanation}
      aria-label={`Show ${statistic.figure} ${statistic.label} on ${TAB_LABELS[statistic.opensTab]}`}
      onClick={kanbanLane === null ? undefined : () => onShowLane?.(kanbanLane)}
    >
      {parts}
    </a>
  );
}

function tabItemOf(tab: BridgeTab, tabCount: TabCount | undefined): LinkTabItem<BridgeTab> {
  const item = { key: tab, label: TAB_LABELS[tab], href: HashRouter.fragmentOf({ tab, item: null }) };
  if (tabCount === undefined) return item;
  return { ...item, countBadge: <CountBadge count={tabCount.count} {...COUNT_BADGE_OF_TONE[tabCount.tone]} />, accessibleName: tabCount.ariaLabel };
}

function OverseerControls({ model }: { readonly model: HeaderModel }) {
  const anyControl = model.pauseControl !== null || model.restartOffered || model.stopOffered;
  if (!anyControl) return null;
  return (
    <div className="bridge-head-controls" role="group" aria-label="Overseer controls">
      {model.pauseControl === null ? null : (
        <CommandButton
          label={model.pauseControl === 'resume' ? 'Resume' : 'Pause'}
          command={{ kind: model.pauseControl === 'resume' ? 'overseer-resume' : 'overseer-pause' }}
          compact
        />
      )}
      {model.restartOffered ? <CommandButton label="Restart" command={{ kind: 'overseer-restart', now: false }} answeredWhileInstallHeld compact /> : null}
      {model.stopOffered ? <StopOverseer /> : null}
    </div>
  );
}

interface SetupHeaderProps {
  readonly project:       string;
  readonly model:         HeaderModel;
  readonly setupSteps:    NonNullable<HeaderModel['setupSteps']>;
  readonly themeChoice:   ThemeChoice;
  readonly onThemeChoice: (choice: ThemeChoice) => void;
}

function SetupHeader({
  project, model, setupSteps, themeChoice, onThemeChoice
}: SetupHeaderProps) {
  return (
    <header className="bridge-header">
      <div className="bridge-head-title-row">
        <ProductBrand />
        <span className="bridge-head-divider" aria-hidden="true" />
        <h1 className="bridge-title">{project}</h1>
        <StatusPill model={model} />
        <StatusDetails model={model} />
        <div className="bridge-head-end">
          <ThemeButton themeChoice={themeChoice} onThemeChoice={onThemeChoice} />
        </div>
      </div>
      <SetupStepBar steps={setupSteps} />
    </header>
  );
}

export function Header({
  project, model, selectedTab, shownTabs, themeChoice, onThemeChoice, activityIsLive, sidePanelIsOpen, clock, tabBarEnd, onShowLane,
  waitingOnUser, tabCounts, questionNotifier, timestampSlices
}: HeaderProps) {
  if (model.setupSteps !== null) {
    return <SetupHeader project={project} model={model} setupSteps={model.setupSteps} themeChoice={themeChoice} onThemeChoice={onThemeChoice} />;
  }
  return (
    <header className="bridge-header">
      <div className="bridge-head-title-row">
        <FlintBrainWakingBrand wakes={model.flintBrainWakes} />
        <span className="bridge-head-divider" aria-hidden="true" />
        <h1 className="bridge-title">{project}</h1>
        <StatusPill model={model} />
        <StatusDetails model={model} />
        <div className="bridge-head-end">
          <div className="bridge-summary" aria-label="Statistics">
            {model.statistics.map((statistic) => <Statistic key={statistic.label} statistic={statistic} onShowLane={onShowLane} />)}
            {waitingOnUser === null
              ? null
              : (
                <WaitingOnUserPill
                  waiting={waitingOnUser}
                  clock={clock}
                  isLive={activityIsLive}
                  timestampSlices={timestampSlices}
                  notifier={questionNotifier}
                  onShowLane={onShowLane}
                />
              )}
          </div>
          <OverseerControls model={model} />
          <ThemeButton themeChoice={themeChoice} onThemeChoice={onThemeChoice} />
        </div>
      </div>
      <ActivityStrip facts={model.activity} isLive={activityIsLive} clock={clock} showsFlintSlot={selectedTab === 'kanban' && !sidePanelIsOpen} />
      <div className="bridge-tab-bar">
        <div className="bridge-tab-bar-tabs">
          <Tabs
            label="Views"
            mode="links"
            size="page"
            items={shownTabs.map((tab) => tabItemOf(tab, tabCounts[tab]))}
            selectedKey={selectedTab}
            onSelect={(tab) => HashRouter.navigateTo({ tab, item: null })}
          />
        </div>
        {tabBarEnd}
      </div>
    </header>
  );
}
