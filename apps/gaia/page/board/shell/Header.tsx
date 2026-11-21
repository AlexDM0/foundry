/**
 * The header's rows: the title row (the Forge mark and wordmark, the project title, the state pill and its quiet details, then at its right
 * end the figures closed by the Waiting on User pill), the "Agents at work" strip, and the tab bar, its tabs counting what waits on User,
 * with whatever the shell puts at its right end. The forge's controls and the theme are Gaia's own, outside the board. In setup, while the
 * board has no readable pipeline, the header is the title row (the mark, the title, the Setting up pill, the new-code notice) over the setup
 * step bar: no figures, no Waiting on User pill, no activity strip and no tabs.
 */

import { ForgeMark }                          from 'brand/ForgeMark';
import { CountBadge, type CountBadgeColours } from 'design-system/CountBadge';
import type { StepperStep }                   from 'design-system/Stepper';
import { Tabs, type LinkTabItem }             from 'design-system/Tabs';
import { Text }                               from 'design-system/Text';
import type { ReactNode }                     from 'react';

import { StateToneUtil }                      from '../utils/StateToneUtil.ts';
import type { TimestampSlices }               from '../utils/TimeUtil.ts';
import type { QuestionNotifier }              from '../views/questions/QuestionAlerts.ts';
import { ActivityStrip }                      from './ActivityStrip.tsx';
import type { BoardClock }                    from './BoardClock.ts';
import { useBoardHrefOf, useBoardNavigation } from './BoardRouteLinks.ts';
import type { BoardRoute, BoardTab }          from './BoardRouter.ts';
import { useChangedSinceMount }               from './ChangedSinceMount.ts';
import type {
  HeaderFigureLane,
  HeaderModel,
  HeaderStatistic,
  SetupStepView
} from './HeaderModel.ts';
import { SetupStepBar } from './SetupStepBar.tsx';
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
  readonly selectedTab:      BoardTab;
  /** The tabs the board shows, in order. */
  readonly shownTabs:        readonly BoardTab[];
  /** While the event stream is down the strip's dots go quiet and its times stand still. */
  readonly activityIsLive:   boolean;
  /** A ticket detail or the question panel is open; it holds the page's one Flint slot, so the strip shows none. */
  readonly sidePanelIsOpen:  boolean;
  readonly clock:            BoardClock;
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

export const TAB_LABELS: Readonly<Record<BoardTab, string>> = {
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

/** Forge's mark from the brand package and the lowercase wordmark, the same on every screen. */
function ProductBrand() {
  return (
    <span className="board-brand">
      <ForgeMark sizePixels={FORGE_MARK_SIDE_PIXELS} />
      <span className="board-wordmark">{PRODUCT_WORDMARK}</span>
    </span>
  );
}

/** Running is the orange pill with the live dot; every other state, setup among them, is the quiet pill. A new state's pill pops in. */
function StatusPill({ model }: { readonly model: HeaderModel }) {
  const hasChanged = useChangedSinceMount(model.statusToken);
  return (
    <span
      key={model.statusToken}
      className="board-status-pill"
      data-running={model.isRunning ? '' : undefined}
      data-status={model.statusToken}
      data-value-changed={hasChanged ? '' : undefined}
    >
      {model.isRunning ? <span className="board-status-dot" aria-hidden="true" /> : null}
      {model.statusLabel}
    </span>
  );
}

/** The usage windows and the new-code notice after the pill, one quiet line. */
function StatusDetails({ model }: { readonly model: HeaderModel }) {
  const usage = model.statusDetails.join(' · ');
  if (usage === '' && model.newCodeNotice === null) return null;
  return (
    <span className="board-status-details">
      {usage === '' ? null : <Text typeRole="small" subtle>{usage}</Text>}
      {usage === '' || model.newCodeNotice === null ? null : <span aria-hidden="true">·</span>}
      {model.newCodeNotice === null ? null : <span className="board-status-notice" role="status">{model.newCodeNotice}</span>}
    </span>
  );
}

function Statistic({ statistic, onShowLane }: { readonly statistic: HeaderStatistic; readonly onShowLane: ((lane: HeaderFigureLane) => void) | undefined }) {
  const hasChanged = useChangedSinceMount(statistic.figure);
  const hrefOf = useBoardHrefOf();
  const parts = (
    <>
      <span key={statistic.figure} className="board-stat-figure" data-value-changed={hasChanged ? '' : undefined}>{statistic.figure}</span>
      <span className="board-stat-label">{statistic.label}</span>
    </>
  );
  const explanation = statistic.explanation ?? undefined;
  if (statistic.opensTab === null) return <span className="board-stat" title={explanation}>{parts}</span>;
  const { kanbanLane } = statistic;
  return (
    <a
      className="board-stat"
      href={hrefOf({ tab: statistic.opensTab, item: null })}
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

function tabItemOf(tab: BoardTab, tabCount: TabCount | undefined, hrefOf: (route: BoardRoute) => string): LinkTabItem<BoardTab> {
  const item = { key: tab, label: TAB_LABELS[tab], href: hrefOf({ tab, item: null }) };
  if (tabCount === undefined) return item;
  return { ...item, countBadge: <CountBadge count={tabCount.count} {...COUNT_BADGE_OF_TONE[tabCount.tone]} />, accessibleName: tabCount.ariaLabel };
}

interface SetupHeaderProps {
  readonly project:    string;
  readonly model:      HeaderModel;
  readonly setupSteps: readonly SetupStepView[];
}

/** A step that reopens links to its route under the mounted board. */
function stepperStepOf(step: SetupStepView, hrefOf: (route: BoardRoute) => string): StepperStep {
  const { reopensAt, ...stepFields } = step;
  return reopensAt === null ? stepFields : { ...stepFields, href: hrefOf(reopensAt) };
}

function SetupHeader({ project, model, setupSteps }: SetupHeaderProps) {
  const hrefOf = useBoardHrefOf();
  return (
    <header className="board-header">
      <div className="board-head-title-row">
        <ProductBrand />
        <span className="board-head-divider" aria-hidden="true" />
        <h1 className="board-title">{project}</h1>
        <StatusPill model={model} />
        <StatusDetails model={model} />
      </div>
      <SetupStepBar steps={setupSteps.map((step) => stepperStepOf(step, hrefOf))} />
    </header>
  );
}

export function Header({
  project, model, selectedTab, shownTabs, activityIsLive, sidePanelIsOpen, clock, tabBarEnd, onShowLane, waitingOnUser, tabCounts, questionNotifier, timestampSlices
}: HeaderProps) {
  const hrefOf = useBoardHrefOf();
  const navigate = useBoardNavigation();
  if (model.setupSteps !== null) return <SetupHeader project={project} model={model} setupSteps={model.setupSteps} />;
  return (
    <header className="board-header">
      <div className="board-head-title-row">
        <ProductBrand />
        <span className="board-head-divider" aria-hidden="true" />
        <h1 className="board-title">{project}</h1>
        <StatusPill model={model} />
        <StatusDetails model={model} />
        <div className="board-head-end">
          <div className="board-summary" aria-label="Statistics">
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
        </div>
      </div>
      <ActivityStrip facts={model.activity} isLive={activityIsLive} clock={clock} showsFlintSlot={selectedTab === 'kanban' && !sidePanelIsOpen} />
      <div className="board-tab-bar">
        <div className="board-tab-bar-tabs">
          <Tabs
            label="Views"
            mode="links"
            size="page"
            items={shownTabs.map((tab) => tabItemOf(tab, tabCounts[tab], hrefOf))}
            selectedKey={selectedTab}
            onSelect={(tab) => navigate({ tab, item: null })}
          />
        </div>
        {tabBarEnd}
      </div>
    </header>
  );
}
