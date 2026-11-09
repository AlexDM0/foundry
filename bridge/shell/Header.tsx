/**
 * The header, the static page's three rows: the title row (the status line, the Overseer's compact controls under it, the project title,
 * and at its right the theme switch and the figures), the activity strip, and the tab bar with whatever the shell puts at its right
 * end. Embedded, `board.css` keeps only the tab bar.
 */
import {
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode
} from 'react';

import { ActivityStrip }                     from './ActivityStrip.tsx';
import type { ActivityEntry }                from './ActivityStripModel.ts';
import type { BridgeClock }                  from './BridgeClock.ts';
import { CommandButton }                     from './CommandButton.tsx';
import { HashRouter, type BridgeTab }        from './HashRouter.ts';
import type { HeaderModel, HeaderStatistic } from './HeaderModel.ts';
import type { ThemeChoice }                  from './ThemeBootstrap.ts';

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
      {wanted === limit || !Number.isInteger(wanted) || wanted < 1 ? null : <CommandButton label="Set" command={{ kind: 'concurrency-set', limit: wanted }} />}
    </span>
  );
}

/** One radio group: the checked choice alone takes the tab stop, and the arrow keys move, check and wrap, as the static switch does. */
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

function Statistic({ statistic }: { readonly statistic: HeaderStatistic }) {
  const parts = (
    <>
      <span className="bridge-stat-figure">{statistic.figure}</span>
      <span className="bridge-stat-label">{statistic.label}</span>
    </>
  );
  if (statistic.opensTab === null) return <span className="bridge-stat">{parts}</span>;
  return (
    <a
      className="bridge-stat"
      href={HashRouter.fragmentOf({ tab: statistic.opensTab, item: null })}
      data-state={statistic.state ?? undefined}
      aria-label={`Show ${statistic.figure} ${statistic.label} on ${TAB_LABELS[statistic.opensTab]}`}
    >
      {parts}
    </a>
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
  project, model, selectedTab, shownTabs, themeChoice, onThemeChoice, activity, activityIsLive, clock, tabBarEnd
}: HeaderProps) {
  return (
    <header className="bridge-header">
      <div className="bridge-head-title-row">
        <div className="bridge-head-identity">
          <div className="bridge-status-line" data-freshness={model.statusToken === 'live' ? 'live' : undefined} data-status={model.statusToken}>
            <span className="bridge-status-dot" aria-hidden="true" />
            <span className="bridge-status-label">{model.statusLabel}</span>
            {model.statusDetails.map((detail) => <span key={detail} className="bridge-status-detail">{detail}</span>)}
            {model.newCodeNotice === null ? null : <span className="bridge-status-notice" role="status">{model.newCodeNotice}</span>}
          </div>
          <OverseerControls model={model} />
          <h1 className="bridge-title">{project}</h1>
        </div>
        <div className="bridge-head-stats">
          <ThemeSwitch themeChoice={themeChoice} onThemeChoice={onThemeChoice} />
          <div className="bridge-summary" aria-label="Statistics">
            {model.statistics.map((statistic) => <Statistic key={statistic.label} statistic={statistic} />)}
          </div>
        </div>
      </div>
      <ActivityStrip entries={activity} isLive={activityIsLive} clock={clock} />
      <div className="bridge-tab-bar">
        <nav className="bridge-tabs" aria-label="Views">
          {shownTabs.map((tab) => (
            <a
              key={tab}
              className="bridge-tab"
              href={HashRouter.fragmentOf({ tab, item: null })}
              aria-current={tab === selectedTab ? 'page' : undefined}
            >
              {TAB_LABELS[tab]}
            </a>
          ))}
        </nav>
        {tabBarEnd}
      </div>
    </header>
  );
}
