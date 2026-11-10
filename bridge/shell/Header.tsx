/**
 * The header's three rows: the title row (the status line over the project title, a divider, the figures inline on one line, and the
 * Overseer's compact controls at its end), the one-line activity strip, and the tab bar with the theme switch and whatever the shell puts
 * at its right end. Embedded, `board.css` keeps the summary line and the tab bar, and shows the stale notice while the event stream is
 * down.
 */
import {
  Fragment,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode
} from 'react';

import { Button }                     from '../design-system/Button.tsx';
import { ConfirmStrip }               from '../design-system/ConfirmStrip.tsx';
import { Tabs }                       from '../design-system/Tabs.tsx';
import { RovingFocusUtil }            from '../design-system/utils/RovingFocusUtil.ts';
import { ActivityStrip }              from './ActivityStrip.tsx';
import type { BridgeClock }           from './BridgeClock.ts';
import { CommandButton }              from './CommandButton.tsx';
import { HashRouter, type BridgeTab } from './HashRouter.ts';
import type {
  HeaderFigureLane,
  HeaderModel,
  HeaderStatistic,
  SummaryLine,
  SummaryLineFigure
} from './HeaderModel.ts';
import type { ThemeChoice } from './ThemeBootstrap.ts';

export interface HeaderProps {
  readonly project:        string;
  readonly model:          HeaderModel;
  readonly selectedTab:    BridgeTab;
  /** The tabs the board shows, in order. */
  readonly shownTabs:      readonly BridgeTab[];
  readonly themeChoice:    ThemeChoice;
  readonly onThemeChoice:  (choice: ThemeChoice) => void;
  /** While the event stream is down the strip's dots go quiet and its times stand still. */
  readonly activityIsLive: boolean;
  readonly clock:          BridgeClock;
  /** What the tab bar holds at its right end: the finished-work filter on a board tab. */
  readonly tabBarEnd?:     ReactNode;
  /** A figure pointing at a Kanban lane was followed; the link itself opens the tab. */
  readonly onShowLane?:    (lane: HeaderFigureLane) => void;
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
};

const THEME_CHOICES: readonly ThemeChoice[] = ['auto', 'light', 'dark'];

const THEME_LABELS: Readonly<Record<ThemeChoice, string>> = { auto: 'Auto', light: 'Light', dark: 'Dark' };

/** The embedded page's word for a stream that went down, centred over the board. */
export const STALE_NOTICE_TEXT = 'Not updated while the Overseer is unreachable';

function StopOverseer() {
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return <Button label="Stop Overseer" onPress={() => setConfirming(true)} />;
  }
  return (
    <ConfirmStrip
      label="Confirm stopping the Overseer"
      question="Stop the Overseer?"
      consequence="Launches end until it is started again."
      tone="neutral"
      confirm={<CommandButton label="Confirm stop" command={{ kind: 'overseer-stop', now: false }} answeredWhileInstallHeld primary />}
      cancelLabel="Cancel"
      onCancel={() => setConfirming(false)}
    />
  );
}

/** One radio group: the checked choice alone takes the tab stop, and the arrow keys, Home and End move, check and wrap. */
function ThemeSwitch({ themeChoice, onThemeChoice }: { readonly themeChoice: ThemeChoice; readonly onThemeChoice: (choice: ThemeChoice) => void }) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const moveChoice = (event: KeyboardEvent<HTMLDivElement>): void => {
    const position = RovingFocusUtil.targetIndexOf(event.key, THEME_CHOICES.indexOf(themeChoice), THEME_CHOICES.length, 'both');
    if (position === null) return;
    event.preventDefault();
    const next = THEME_CHOICES[position] ?? themeChoice;
    onThemeChoice(next);
    buttons.current[position]?.focus();
  };
  return (
    <div className="bridge-theme" role="radiogroup" aria-label="Theme" onKeyDown={moveChoice}>
      {THEME_CHOICES.map((choice, position) => (
        <button
          key={choice}
          ref={(button) => {
            buttons.current[position] = button;
          }}
          type="button"
          role="radio"
          className="bridge-theme-choice"
          aria-checked={choice === themeChoice}
          tabIndex={choice === themeChoice ? 0 : -1}
          onClick={() => onThemeChoice(choice)}
        >
          {THEME_LABELS[choice]}
        </button>
      ))}
    </div>
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
      {figure.state === null ? null : <span className="bridge-summary-line-dot" data-state={figure.state} aria-hidden="true" />}
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

function OverseerControls({ model }: { readonly model: HeaderModel }) {
  const anyControl = model.pauseControl !== null || model.restartOffered || model.stopOffered;
  if (!anyControl) return null;
  return (
    <div className="bridge-head-controls" role="group" aria-label="Overseer controls">
      {model.pauseControl === null ? null : (
        <CommandButton
          label={model.pauseControl === 'resume' ? 'Resume' : 'Pause'}
          command={{ kind: model.pauseControl === 'resume' ? 'overseer-resume' : 'overseer-pause' }}
        />
      )}
      {model.restartOffered ? <CommandButton label="Restart" command={{ kind: 'overseer-restart', now: false }} answeredWhileInstallHeld /> : null}
      {model.stopOffered ? <StopOverseer /> : null}
    </div>
  );
}

export function Header({
  project, model, selectedTab, shownTabs, themeChoice, onThemeChoice, activityIsLive, clock, tabBarEnd, onShowLane
}: HeaderProps) {
  return (
    <header className="bridge-header">
      <div className="bridge-head-title-row">
        <div className="bridge-head-identity">
          <div className="bridge-status-line" data-freshness={model.statusToken === 'live' ? 'live' : undefined} data-status={model.statusToken}>
            <span className="bridge-status-dot" aria-hidden="true" />
            <span className="bridge-status-label">{model.statusLabel}</span>
            {model.statusDetails.length === 0 ? null : <span className="bridge-status-detail">{model.statusDetails.join(' · ')}</span>}
            {model.newCodeNotice === null ? null : <span className="bridge-status-notice" role="status">{model.newCodeNotice}</span>}
          </div>
          <h1 className="bridge-title">{project}</h1>
        </div>
        <span className="bridge-head-divider" aria-hidden="true" />
        <div className="bridge-summary" aria-label="Statistics">
          {model.statistics.map((statistic, index) => (
            <Fragment key={statistic.label}>
              {index === 0 ? null : <span className="bridge-stat-separator" aria-hidden="true">·</span>}
              <Statistic statistic={statistic} onShowLane={onShowLane} />
            </Fragment>
          ))}
        </div>
        <OverseerControls model={model} />
      </div>
      <ActivityStrip facts={model.activity} isLive={activityIsLive} clock={clock} />
      {model.statusToken === 'down'
        ? (
          <div className="bridge-activity bridge-stale-notice" role="status" aria-live="polite" data-freshness="snapshot">
            <div className="bridge-activity-row">
              <span className="bridge-activity-dot" aria-hidden="true" />
              <span className="bridge-activity-title">{STALE_NOTICE_TEXT}</span>
            </div>
          </div>
        )
        : null}
      {model.summaryLine === null ? null : <SummaryLineView summaryLine={model.summaryLine} />}
      <div className="bridge-tab-bar">
        <Tabs
          label="Views"
          mode="links"
          size="page"
          items={shownTabs.map((tab) => ({ key: tab, label: TAB_LABELS[tab], href: HashRouter.fragmentOf({ tab, item: null }) }))}
          selectedKey={selectedTab}
          onSelect={(tab) => HashRouter.navigateTo({ tab, item: null })}
        />
        <ThemeSwitch themeChoice={themeChoice} onThemeChoice={onThemeChoice} />
        {tabBarEnd}
      </div>
    </header>
  );
}
