/**
 * The header's rows: the title row, the "Agents at work" strip and the tab bar. The forge's controls and the theme are Gaia's own, outside
 * the board; in setup the board draws no header, since the page's own head names the forge and holds the setup step bar.
 */

import type { ReactNode } from 'react';
import { ForgeMark }      from '../../lib/brand/BrandInterface.ts';
import {
  CountBadge,
  type CountBadgeColours,
  type LinkTabItem,
  MenuItem,
  Tabs,
  Text
} from '../../lib/design-system/DesignSystemInterface.ts';

import {
  BoardRouter,
  type BoardMenuEntry,
  type BoardRoute,
  type BoardTab,
  type ProgressView
} from '../../shared/BoardRouter.ts';
import type { QuestionNotifier }                               from '../@types/QuestionNotifier.ts';
import type { BoardClock }                                     from '../shared/BoardClock.ts';
import { useChangedSinceMount }                                from '../shared/ChangedSinceMount.ts';
import { useBoardHrefOf, useBoardNavigation }                  from '../shared/routing/BoardRouteLinks.ts';
import { StateToneUtil }                                       from '../utils/StateToneUtil.ts';
import type { TimestampSlices }                                from '../utils/TimeUtil.ts';
import { ActivityStrip }                                       from './ActivityStrip.tsx';
import type { HeaderFigureLane, HeaderModel, HeaderStatistic } from './HeaderModel.ts';
import {
  WaitingOnUserModel,
  type TabCount,
  type TabCounts,
  type TabCountTone,
  type WaitingOnUser
} from './WaitingOnUserModel.ts';
import { WaitingOnUserPill } from './WaitingOnUserPill.tsx';

export interface HeaderProps {
  readonly project:            string;
  readonly model:              HeaderModel;
  readonly selectedTab:        BoardTab;
  /** The tabs the board shows, in order. */
  readonly shownTabs:          readonly BoardTab[];
  /** The view the Progress entry opens and names: the one open now, else the one this viewer opened last. */
  readonly progressViewToOpen: ProgressView;
  /** While the event stream is down the strip's dots go quiet and its times stand still. */
  readonly activityIsLive:     boolean;
  /** A ticket detail or the question panel is open; it holds the page's one Flint slot, so the strip shows none. */
  readonly sidePanelIsOpen:    boolean;
  readonly clock:              BoardClock;
  /** What the tab bar holds at its right end: the finished-work filter on a board tab. */
  readonly tabBarEnd?:         ReactNode;
  /** A figure pointing at a Kanban lane was followed; the link itself opens the tab. */
  readonly onShowLane?:        (lane: HeaderFigureLane) => void;
  /** `null` before the first board, which shows no pill. */
  readonly waitingOnUser:      WaitingOnUser | null;
  readonly tabCounts:          TabCounts;
  readonly questionNotifier:   QuestionNotifier;
  /** The page's stamp slices the inbox shows full stamps by; `null` on a board that serves no page. */
  readonly timestampSlices:    TimestampSlices | null;
}

export const TAB_LABELS: Readonly<Record<BoardTab, string>> = {
  tickets:   'Tickets',
  kanban:    'Kanban',
  waves:     'Waves',
  gantt:     'Gantt',
  epics:     'Epics',
  agents:    'Agents',
  questions: 'Questions',
  assistant: 'Assistant',
  intake:    'Intake',
  pipeline:  'Pipeline',
  documents: 'Documents',
};

const PROGRESS_ENTRY_LABEL = 'Progress';

const PROGRESS_MENU_LABEL = 'Progress views';

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

/** Running is the orange pill with the live dot; every other state is the quiet pill. A new state's pill pops in. */
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

interface MenuEntrySurroundings {
  readonly shownTabs:          readonly BoardTab[];
  readonly selectedTab:        BoardTab;
  readonly progressViewToOpen: ProgressView;
  readonly hrefOf:             (route: BoardRoute) => string;
  readonly navigate:           (route: BoardRoute) => void;
}

/** The Progress entry names the view it opens, and its menu offers every Progress view the board shows, the open one pressed. */
function progressMenuFieldsOf(surroundings: MenuEntrySurroundings): Pick<LinkTabItem<BoardMenuEntry>, 'subLabel' | 'menuLabel' | 'menuItems'> {
  const {
    shownTabs, selectedTab, progressViewToOpen, navigate
  } = surroundings;
  return {
    subLabel:  TAB_LABELS[progressViewToOpen],
    menuLabel: PROGRESS_MENU_LABEL,
    menuItems: BoardRouter.shownProgressViewsOf(shownTabs).map((view) => (
      <MenuItem key={view} label={TAB_LABELS[view]} pressed={view === selectedTab} closing="return-focus" onChoose={() => navigate({ tab: view, item: null })} />
    )),
  };
}

function tabItemOf(entry: BoardMenuEntry, tabCount: TabCount | undefined, surroundings: MenuEntrySurroundings): LinkTabItem<BoardMenuEntry> {
  const href = surroundings.hrefOf(BoardRouter.routeOfMenuEntry(entry, surroundings.progressViewToOpen));
  const item: LinkTabItem<BoardMenuEntry> = entry === 'progress'
    ? {
      key: entry, label: PROGRESS_ENTRY_LABEL, href, ...progressMenuFieldsOf(surroundings)
    }
    : { key: entry, label: TAB_LABELS[entry], href };
  if (tabCount === undefined) return item;
  // A name given beside the count replaces the label's own, so Progress names the view it opens there too.
  const accessibleName = entry === 'progress'
    ? `${PROGRESS_ENTRY_LABEL} ${TAB_LABELS[surroundings.progressViewToOpen]}, ${WaitingOnUserModel.waitingPhraseOf(tabCount.count)}`
    : tabCount.ariaLabel;
  return { ...item, countBadge: <CountBadge count={tabCount.count} {...COUNT_BADGE_OF_TONE[tabCount.tone]} />, accessibleName };
}

export function Header({
  project, model, selectedTab, shownTabs, progressViewToOpen, activityIsLive, sidePanelIsOpen, clock, tabBarEnd, onShowLane, waitingOnUser, tabCounts, questionNotifier,
  timestampSlices
}: HeaderProps) {
  const hrefOf = useBoardHrefOf();
  const navigate = useBoardNavigation();
  if (model.setupSteps !== null) return null;
  const menuEntrySurroundings: MenuEntrySurroundings = {
    shownTabs, selectedTab, progressViewToOpen, hrefOf, navigate
  };
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
            items={BoardRouter.shownMenuEntriesOf(shownTabs).map((entry) => tabItemOf(entry, tabCounts[entry], menuEntrySurroundings))}
            selectedKey={BoardRouter.menuEntryOf(selectedTab)}
            onSelect={(entry) => navigate(BoardRouter.routeOfMenuEntry(entry, progressViewToOpen))}
          />
        </div>
        {tabBarEnd}
      </div>
    </header>
  );
}
