/**
 * The header's rows: the title row (the Forge mark and wordmark, the project title, the state pill and its quiet details, then at its
 * right end the figures closed by the Waiting on User pill, the Overseer's compact controls and the theme button), the "Agents at work"
 * strip, and the tab bar, its tabs counting what waits on User, with whatever the shell puts at its right end. Embedded, `board.css` keeps
 * the summary line and the tab bar, and shows the stale notice while the event stream is down. In setup, while the board has no readable
 * pipeline, the header is the title row (the mark, the title, the Setting up pill, the new-code notice, the theme button) over the setup
 * step bar: no figures, no Waiting on User pill, no Overseer controls, no activity strip, no summary line and no tabs.
 */

import { Banner }                             from 'design-system/Banner';
import { Button }                             from 'design-system/Button';
import { ConfirmStrip }                       from 'design-system/ConfirmStrip';
import { CountBadge, type CountBadgeColours } from 'design-system/CountBadge';
import { Tabs, type LinkTabItem }             from 'design-system/Tabs';
import { Text }                               from 'design-system/Text';
import { Fragment, useState, type ReactNode } from 'react';

import { StateToneUtil }              from '../utils/StateToneUtil.ts';
import type { TimestampSlices }       from '../utils/TimeUtil.ts';
import type { QuestionNotifier }      from '../views/questions/QuestionAlerts.ts';
import { ActivityStrip }              from './ActivityStrip.tsx';
import type { BridgeClock }           from './BridgeClock.ts';
import { CommandButton }              from './CommandButton.tsx';
import { ForgeMark }                  from './ForgeMark.tsx';
import { HashRouter, type BridgeTab } from './HashRouter.ts';
import type {
  HeaderFigureLane,
  HeaderModel,
  HeaderStatistic,
  SummaryLine,
  SummaryLineFigure
} from './HeaderModel.ts';
import { SetupStepBar }     from './SetupStepBar.tsx';
import type { ThemeChoice } from './ThemeBootstrap.ts';
import { ThemeButton }      from './ThemeButton.tsx';
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

/** The embedded page's word for a stream that went down, centred over the board. */
export const STALE_NOTICE_TEXT = 'Not updated while the Overseer is unreachable';

const PRODUCT_WORDMARK = 'forge';

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

/** The Forge mark and the lowercase wordmark, the same on every screen. */
function ProductBrand() {
  return (
    <span className="bridge-brand">
      <ForgeMark />
      <span className="bridge-wordmark">{PRODUCT_WORDMARK}</span>
    </span>
  );
}

/** Running is the orange pill with the live dot; every other state, setup among them, is the quiet pill. */
function StatusPill({ model }: { readonly model: HeaderModel }) {
  return (
    <span className="bridge-status-pill" data-running={model.isRunning ? '' : undefined} data-status={model.statusToken}>
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
  const parts = (
    <>
      <span className="bridge-stat-figure">{statistic.figure}</span>
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

function SummaryLineItem({ figure }: { readonly figure: SummaryLineFigure }) {
  return (
    <span className="bridge-summary-line-item">
      {figure.state === null
        ? null
        : <span className="bridge-summary-line-dot" data-state={figure.state} data-state-tone={StateToneUtil.toneOf(figure.state)} aria-hidden="true" />}
      <span className="bridge-summary-line-figure">{figure.figure}</span>
      <span className="bridge-summary-line-label">{figure.label}</span>
    </span>
  );
}

/** The states, a spacer, then today's figures with a divider between them. */
function SummaryLineView({ summaryLine }: { readonly summaryLine: SummaryLine }) {
  return (
    <div className="bridge-summary-line">
      {summaryLine.states.map((figure) => <SummaryLineItem key={figure.label} figure={figure} />)}
      <span className="bridge-summary-line-spacer" />
      {summaryLine.today.map((figure, index) => (
        <Fragment key={figure.label}>
          {index === 0 ? null : <span className="bridge-summary-line-divider" aria-hidden="true" />}
          <SummaryLineItem figure={figure} />
        </Fragment>
      ))}
    </div>
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

/** The snapshot banner; `board.css` shows it only embedded, where the unreachable banner is not shown; it waits for an open side panel to close. */
function StaleNotice() {
  return (
    <div className="bridge-stale-notice">
      <Banner tone="quiet" role="status" text={STALE_NOTICE_TEXT} />
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
      {model.statusToken === 'down' ? <StaleNotice /> : null}
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
        <ProductBrand />
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
      {model.statusToken === 'down' && !sidePanelIsOpen ? <StaleNotice /> : null}
      {model.summaryLine === null ? null : <SummaryLineView summaryLine={model.summaryLine} />}
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
