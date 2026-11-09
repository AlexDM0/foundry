/**
 * The header's three rows: the title row (the status line with the Overseer's compact controls after it, the project title, and at its
 * right the theme switch and the figures), the activity strip, and the tab bar with whatever the shell puts at its right end. Embedded,
 * `board.css` keeps the summary line and the tab bar, and shows the stale notice while the event stream is down.
 */
import {
  Fragment,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode
} from 'react';

import { ActivityStrip }              from './ActivityStrip.tsx';
import type { ActivityEntry }         from './ActivityStripModel.ts';
import type { BridgeClock }           from './BridgeClock.ts';
import { CommandButton }              from './CommandButton.tsx';
import { HashRouter, type BridgeTab } from './HashRouter.ts';
import {
  HeaderModelUtil,
  type HeaderFigureLane,
  type HeaderModel,
  type HeaderStatistic,
  type SummaryLine,
  type SummaryLineFigure
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
  readonly activity:       readonly ActivityEntry[];
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

const PREVIOUS_CHOICE_KEYS: readonly string[] = ['ArrowLeft', 'ArrowUp'];
const NEXT_CHOICE_KEYS: readonly string[] = ['ArrowRight', 'ArrowDown'];

/** The embedded page's word for a stream that went down, centred over the board. */
export const STALE_NOTICE_TEXT = 'Not updated while the Overseer is unreachable';

function StopOverseer() {
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return <button type="button" className="bridge-button" onClick={() => setConfirming(true)}>Stop Overseer</button>;
  }
  return (
    <span className="bridge-confirm" role="group" aria-label="Confirm stopping the Overseer">
      Stop the Overseer? Launches end until it is started again.
      <CommandButton label="Confirm stop" command={{ kind: 'overseer-stop', now: false }} answeredWhileInstallHeld primary />
      <button type="button" className="bridge-button" onClick={() => setConfirming(false)}>Cancel</button>
    </span>
  );
}

function ConcurrencyControl({ limit }: { readonly limit: number }) {
  const [wanted, setWanted] = useState(limit);
  return (
    <span className="bridge-field">
      <label className="bridge-field-label">
        agents at most
        <input
          className="bridge-field-input"
          type="number"
          min={1}
          value={wanted}
          aria-label="Concurrency limit"
          onChange={(event) => setWanted(Number(event.currentTarget.value))}
        />
      </label>
      {HeaderModelUtil.concurrencyLimitIsSendable(wanted, limit) ? <CommandButton label="Set" command={{ kind: 'concurrency-set', limit: wanted }} /> : null}
    </span>
  );
}

/** One radio group: the checked choice alone takes the tab stop, and the arrow keys move, check and wrap. */
function ThemeSwitch({ themeChoice, onThemeChoice }: { readonly themeChoice: ThemeChoice; readonly onThemeChoice: (choice: ThemeChoice) => void }) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const moveChoice = (event: KeyboardEvent<HTMLDivElement>): void => {
    const step = PREVIOUS_CHOICE_KEYS.includes(event.key) ? -1 : (NEXT_CHOICE_KEYS.includes(event.key) ? 1 : 0);
    if (step === 0) return;
    event.preventDefault();
    const position = (THEME_CHOICES.indexOf(themeChoice) + step + THEME_CHOICES.length) % THEME_CHOICES.length;
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
  if (statistic.opensTab === null) return <span className="bridge-stat">{parts}</span>;
  const { kanbanLane } = statistic;
  return (
    <a
      className="bridge-stat"
      href={HashRouter.fragmentOf({ tab: statistic.opensTab, item: null })}
      data-state={statistic.state ?? undefined}
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

/** The arrow keys, Home and End move to a tab and open it, as a click would. */
function TabBar({ shownTabs, selectedTab }: { readonly shownTabs: readonly BridgeTab[]; readonly selectedTab: BridgeTab }) {
  const links = useRef<(HTMLAnchorElement | null)[]>([]);
  const moveTab = (event: KeyboardEvent<HTMLElement>): void => {
    const current = links.current.findIndex((link) => link === event.target);
    if (current < 0) return;
    const targetIndexByKey: Readonly<Record<string, number>> = {
      ArrowRight: current + 1, ArrowLeft: current - 1, Home: 0, End: shownTabs.length - 1,
    };
    if (!Object.hasOwn(targetIndexByKey, event.key)) return;
    event.preventDefault();
    const position = ((targetIndexByKey[event.key] ?? current) + shownTabs.length) % shownTabs.length;
    const tab = shownTabs[position];
    if (tab === undefined) return;
    links.current[position]?.focus();
    HashRouter.navigateTo({ tab, item: null });
  };
  return (
    <nav className="bridge-tabs" aria-label="Views" onKeyDown={moveTab}>
      {shownTabs.map((tab, position) => (
        <a
          key={tab}
          ref={(link) => {
            links.current[position] = link;
          }}
          className="bridge-tab"
          href={HashRouter.fragmentOf({ tab, item: null })}
          aria-current={tab === selectedTab ? 'page' : undefined}
        >
          {TAB_LABELS[tab]}
        </a>
      ))}
    </nav>
  );
}

function OverseerControls({ model }: { readonly model: HeaderModel }) {
  const anyControl = model.pauseControl !== null || model.restartOffered || model.stopOffered || model.concurrencyLimit !== null;
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
      {model.concurrencyLimit === null ? null : <ConcurrencyControl key={model.concurrencyLimit} limit={model.concurrencyLimit} />}
    </div>
  );
}

export function Header({
  project, model, selectedTab, shownTabs, themeChoice, onThemeChoice, activity, activityIsLive, clock, tabBarEnd, onShowLane
}: HeaderProps) {
  return (
    <header className="bridge-header">
      <div className="bridge-head-title-row">
        <div className="bridge-head-identity">
          <div className="bridge-status-row">
            <div className="bridge-status-line" data-freshness={model.statusToken === 'live' ? 'live' : undefined} data-status={model.statusToken}>
              <span className="bridge-status-dot" aria-hidden="true" />
              <span className="bridge-status-label">{model.statusLabel}</span>
              {model.statusDetails.length === 0 ? null : <span className="bridge-status-detail">{model.statusDetails.join(' · ')}</span>}
              {model.newCodeNotice === null ? null : <span className="bridge-status-notice" role="status">{model.newCodeNotice}</span>}
            </div>
            <OverseerControls model={model} />
          </div>
          <h1 className="bridge-title">{project}</h1>
        </div>
        <div className="bridge-head-stats">
          <ThemeSwitch themeChoice={themeChoice} onThemeChoice={onThemeChoice} />
          <div className="bridge-summary" aria-label="Statistics">
            {model.statistics.map((statistic) => <Statistic key={statistic.label} statistic={statistic} onShowLane={onShowLane} />)}
          </div>
        </div>
      </div>
      <ActivityStrip entries={activity} isLive={activityIsLive} clock={clock} />
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
        <TabBar shownTabs={shownTabs} selectedTab={selectedTab} />
        {tabBarEnd}
      </div>
    </header>
  );
}
