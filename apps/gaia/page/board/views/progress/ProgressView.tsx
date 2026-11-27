/**
 * The Gantt, the Progress view: the range control and row options over the chart of `ProgressModel`, its rows grouped by epic. Bars, ticks, spans and
 * the now line are placed through the `style` prop.
 */

import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type AnimationEvent,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type RefObject
} from 'react';

import type { BoardDocument } from '../../../@types/board/BoardDocument.ts';
import {
  Icon,
  Menu,
  MenuItem,
  PageHead,
  Row,
  StateBadge
} from '../../../lib/design-system/DesignSystemInterface.ts';
import type { BoardRoute }                                             from '../../../shared/BoardRouter.ts';
import { CountTextUtil }                                               from '../../../shared/utils/CountTextUtil.ts';
import { EpicChips }                                                   from '../../chips/EpicChips.tsx';
import type { PreferenceStore }                                        from '../../preferences/PreferenceStore.ts';
import { useChangedKeys }                                              from '../../shared/ChangeHighlight.ts';
import { useCoveringPanelWidthProperty }                               from '../../shared/CoveringPanel.ts';
import { useFinishedWorkWindow }                                       from '../../shared/FinishedWorkWindow.ts';
import { useBoardHrefOf }                                              from '../../shared/routing/BoardRouteLinks.ts';
import { DetailRoute }                                                 from '../../shared/routing/DetailRoute.ts';
import { useDetailRouting }                                            from '../../shared/routing/DetailRouting.ts';
import { GeometryUtil }                                                from '../../utils/GeometryUtil.ts';
import { StateToneUtil }                                               from '../../utils/StateToneUtil.ts';
import { BoardLifetimeControls }                                       from './BoardLifetimeControls.tsx';
import { useChartPanelRoom }                                           from './ChartPanelRoom.ts';
import { EpicRowGrouping, type EpicGroupHeadModel, type EpicRowGroup } from './EpicRowGrouping.ts';
import { ProgressModel, type ProgressBarModel, type ProgressRowModel } from './ProgressModel.ts';
import { progressPreferencesOf }                                       from './ProgressPreferences.ts';
import { RangeControl }                                                from './RangeControl.tsx';
import { useTimelineHabitat }                                          from './UseTimelineHabitat.ts';
import { AxisFitUtil }                                                 from './utils/AxisFitUtil.ts';
import { ChartPreferenceUtil, type StoredViewOverride }                from './utils/ChartPreferenceUtil.ts';

export interface ProgressViewProps {
  readonly board:                BoardDocument;
  readonly boardStore:           PreferenceStore;
  readonly nowEpochMilliseconds: number;
  readonly todayCalendarDate:    string;
}

/** The group head's fold mark, a chevron pointing down while the group is open. */
function FoldChevron() {
  return (
    <svg className="board-progress-epic-caret" viewBox="0 0 12 12" aria-hidden="true">
      <path d="M3 4.5 L6 7.5 L9 4.5" />
    </svg>
  );
}

function rowCountTextOf(rowCount: number): string {
  return CountTextUtil.countedPhrase(rowCount, 'row', 'rows');
}

function ticketRowRouteOf(ticketId: string): BoardRoute {
  return { tab: 'tickets', item: DetailRoute.itemTextOf({ form: 'ticket-row', ticketId }) };
}

function percent(value: number): string {
  return `${value}%`;
}

/** A choice read from the store until the viewer makes one, so a store that arrives after the first render is still read. */
function useStoredChoice<Choice>(read: () => Choice, write: (choice: Choice) => void): [Choice, (choice: Choice) => void] {
  const [chosen, setChosen] = useState<{ readonly choice: Choice } | null>(null);
  const stored = useMemo(() => read(), [read]);
  const choose = useCallback((choice: Choice) => {
    write(choice);
    setChosen({ choice });
  }, [write]);
  return [chosen === null ? stored : chosen.choice, choose];
}

/** The track's width in pixels as laid out, 0 where nothing is laid out. */
function useTrackWidthPixels(trackRef: RefObject<HTMLDivElement | null>): number {
  const [widthPixels, setWidthPixels] = useState(0);
  useLayoutEffect(() => {
    const track = trackRef.current;
    if (track === null) return undefined;
    setWidthPixels(track.clientWidth);
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => setWidthPixels(track.clientWidth));
    observer.observe(track);
    return () => observer.disconnect();
  }, [trackRef]);
  return widthPixels;
}

function ChartBar({ bar }: { readonly bar: ProgressBarModel }) {
  return (
    <div
      className="board-progress-bar"
      data-state={bar.stateToken}
      data-state-tone={StateToneUtil.toneOf(bar.stateToken)}
      data-bar-kind={bar.kind}
      data-live={bar.isLive ? '' : undefined}
      hidden={bar.isHidden}
      title={bar.title ?? undefined}
      style={{ left: percent(bar.leftPercent), width: percent(bar.widthPercent) }}
    />
  );
}

/** A click on a link inside the row, or one that ends a text selection, opens nothing. */
function clickOpensRow(event: MouseEvent<HTMLDivElement>): boolean {
  const clickedLink = event.target instanceof Element && event.target.closest('a') !== null;
  const selection = typeof window.getSelection === 'function' ? window.getSelection() : null;
  return !clickedLink && (selection === null || selection.isCollapsed);
}

interface ChartRowProps {
  readonly row:           ProgressRowModel;
  /** New or moved since the previous board: the row washes in its state's tint once. */
  readonly isChanged:     boolean;
  readonly onChangeShown: (taskId: string) => void;
}

function ChartRow({ row, isChanged, onChangeShown }: ChartRowProps) {
  const routing = useDetailRouting();
  const hrefOf = useBoardHrefOf();
  const detailItem = { form: 'task-row', taskId: row.taskId } as const;
  const toggleOnKey = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    routing.toggle(detailItem);
  };
  return (
    <div
      className="board-progress-row"
      tabIndex={0}
      data-task-id={String(row.taskId)}
      data-state={row.stateToken}
      data-state-tone={StateToneUtil.toneOf(row.stateToken)}
      data-review-of={row.nestedWithTicket ?? undefined}
      data-live={row.isLive ? '' : undefined}
      data-selected={routing.isOpen(detailItem) ? '' : undefined}
      data-changed={isChanged ? '' : undefined}
      onClick={(event) => {
        if (clickOpensRow(event)) routing.toggle(detailItem);
      }}
      onKeyDown={toggleOnKey}
      onAnimationEnd={(event: AnimationEvent<HTMLDivElement>) => {
        if (isChanged && event.target === event.currentTarget) onChangeShown(String(row.taskId));
      }}
    >
      <div className="board-progress-name">
        {row.linkedTicketId === null
          ? <span className="board-progress-number">{row.labelText}</span>
          : <a className="board-progress-number" href={hrefOf(ticketRowRouteOf(row.linkedTicketId))}>{row.labelText}</a>}
        <span className="board-progress-row-name" title={row.nameTitle}>{row.nameText}</span>
        <span className="board-progress-chip">
          <StateBadge
            {...StateToneUtil.lookOf(row.stateToken)}
            label={row.chipText}
            title={row.chipTitle}
            checked={row.chipShowsReviewedCheck}
            fitted
            shrinkable
          />
        </span>
      </div>
      <div className="board-progress-track">
        <span className="board-progress-clip" data-side="left" hidden={!row.clippedLeft} />
        {row.bars.map((bar) => <ChartBar key={bar.key} bar={bar} />)}
        <span className="board-progress-clip" data-side="right" hidden={!row.clippedRight} />
      </div>
    </div>
  );
}

function GroupHeadRow({ head, onToggle }: { readonly head: EpicGroupHeadModel; readonly onToggle: (groupKey: string) => void }) {
  const toggleOnKey = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    onToggle(head.key);
  };
  return (
    <div
      className="board-progress-row board-progress-epic-head"
      data-epic-key={head.key}
      data-epic-slot={head.slot === null ? undefined : String(head.slot)}
      data-collapsed={head.isFolded ? '' : undefined}
      role="button"
      tabIndex={0}
      aria-expanded={!head.isFolded}
      onClick={() => onToggle(head.key)}
      onKeyDown={toggleOnKey}
    >
      <div className="board-progress-name">
        <FoldChevron />
        {head.slot === null ? head.label : <EpicChips epics={[{ key: head.key, title: head.label, slot: head.slot }]} />}
        <span className="board-progress-epic-count">{rowCountTextOf(head.memberCount)}</span>
        {head.sharedMemberCount === 0
          ? null
          : <span className="board-progress-epic-count" title={`${head.sharedMemberCount} of its tickets show under another epic`}>{`+${head.sharedMemberCount} shared`}</span>}
        {head.doneText === null ? null : <span className="board-progress-epic-done">{head.doneText}</span>}
      </div>
      <div className="board-progress-track">
        {head.span === null
          ? null
          : (
            <div
              className="board-progress-epic-span"
              data-open={head.span.isOpen ? '' : undefined}
              title={head.span.title}
              style={{ left: percent(head.span.leftPercent), width: percent(head.span.widthPercent) }}
            />
          )}
      </div>
    </div>
  );
}

function ChartRows({
  rows, groups, onToggleGroup, changedTaskIds, onChangeShown
}: {
  readonly rows:           readonly ProgressRowModel[];
  readonly groups:         readonly EpicRowGroup<ProgressRowModel>[] | null;
  readonly onToggleGroup:  (groupKey: string) => void;
  readonly changedTaskIds: ReadonlySet<string>;
  readonly onChangeShown:  (taskId: string) => void;
}) {
  const rowOf = (row: ProgressRowModel) => (
    <ChartRow key={row.taskId} row={row} isChanged={changedTaskIds.has(String(row.taskId))} onChangeShown={onChangeShown} />
  );
  if (groups === null) return <>{rows.map(rowOf)}</>;
  return (
    <>
      {groups.map((group) => [
        <GroupHeadRow key={`head-${group.head.key}`} head={group.head} onToggle={onToggleGroup} />,
        ...group.rows.map(rowOf),
      ])}
    </>
  );
}

/** Which tick labels another label covers, measured once the axis is laid out; a hidden axis measures nothing and covers nothing. */
function useCoveredTickLabels(trackRef: RefObject<HTMLDivElement | null>, layoutKey: string): readonly boolean[] {
  const [covered, setCovered] = useState<readonly boolean[]>([]);
  useLayoutEffect(() => {
    const track = trackRef.current;
    if (track === null) return;
    const labels = [...track.querySelectorAll('.board-progress-tick-label')].map((label) => label.getBoundingClientRect());
    const trackIsLaidOut = track.getBoundingClientRect().width > 0;
    const measured = trackIsLaidOut ? GeometryUtil.coveredTickLabels(labels, []) : labels.map(() => false);
    setCovered((previous) => (previous.length === measured.length && previous.every((flag, index) => flag === measured[index]) ? previous : measured));
  }, [trackRef, layoutKey]);
  return covered;
}

/**
 * The range control's mark: the rows drawn changed while a range was held, since a range was last chosen. It stays once lit, even when the
 * rows change back, until the viewer chooses a range again.
 */
function useRowsChangedUnderHeldRange(shownRowSignature: string, modeIsHeld: boolean): [boolean, () => void] {
  const [seenSignature, setSeenSignature] = useState(shownRowSignature);
  const [rowsChanged, setRowsChanged] = useState(false);
  if (shownRowSignature !== seenSignature) {
    setSeenSignature(shownRowSignature);
    if (modeIsHeld) setRowsChanged(true);
  }
  const rememberRows = useCallback(() => setRowsChanged(false), []);
  return [modeIsHeld && rowsChanged, rememberRows];
}

/**
 * Brings now into view, centred in the part of the chart the pinned column leaves visible, whenever `scrollRequest` changes: once laid
 * out, and on every range or finished-work choice. Wide titles, the review rows and folding keep the viewer's place.
 */
function useNowScrolledIntoView(chartRef: RefObject<HTMLElement | null>, nowPercent: number | null, scrollRequest: string): void {
  const nowPercentReference = useRef(nowPercent);
  useLayoutEffect(() => {
    nowPercentReference.current = nowPercent;
  });
  useLayoutEffect(() => {
    const chart = chartRef.current;
    const shownNowPercent = nowPercentReference.current;
    if (chart === null || shownNowPercent === null || chart.clientWidth === 0) return;
    const pinnedColumn = chart.querySelector('.board-progress-chart-head > .board-progress-name');
    const axis = chart.querySelector('.board-progress-chart-head > .board-progress-track');
    chart.scrollLeft = AxisFitUtil.nowScrollLeftOf(shownNowPercent, {
      clientWidthPixels: chart.clientWidth,
      scrollWidthPixels: chart.scrollWidth,
      pinnedWidthPixels: pinnedColumn?.getBoundingClientRect().width ?? 0,
      axisWidthPixels:   axis?.getBoundingClientRect().width ?? 0,
    });
  }, [chartRef, scrollRequest]);
}

export function ProgressView({
  board, boardStore, nowEpochMilliseconds, todayCalendarDate
}: ProgressViewProps) {
  const preferences = useMemo(() => progressPreferencesOf(boardStore), [boardStore]);
  const routing = useDetailRouting();
  const { cutoffEpochMilliseconds, choice: finishedWorkChoice } = useFinishedWorkWindow();
  const [override, chooseOverride] = useStoredChoice(preferences.readRangeOverride, preferences.writeRangeOverride);
  const [reviewRowsAreShown, chooseReviewRows] = useStoredChoice(preferences.readReviewRowsAreShown, preferences.writeReviewRowsAreShown);
  const [nameColumnWidth, chooseNameColumnWidth] = useStoredChoice(preferences.readNameColumnWidth, preferences.writeNameColumnWidth);
  const [foldedGroupKeys, chooseFoldedGroupKeys] = useStoredChoice(preferences.readFoldedEpicGroups, preferences.writeFoldedEpicGroups);
  const chartRef = useRef<HTMLElement | null>(null);
  const viewElement = useRef<HTMLDivElement | null>(null);
  useTimelineHabitat(viewElement, board);
  const axisTrackRef = useRef<HTMLDivElement | null>(null);
  const trackWidthPixels = useTrackWidthPixels(axisTrackRef);

  const chart = useMemo(
    () => ProgressModel.progressChartOf(board, {
      override, reviewRowsAreShown, nowEpochMilliseconds, todayCalendarDate, cutoffEpochMilliseconds
    }),
    [board, override, reviewRowsAreShown, nowEpochMilliseconds, todayCalendarDate, cutoffEpochMilliseconds],
  );
  const groups = useMemo(() => EpicRowGrouping.epicRowGroupsOf(chart.rows, {
    epics:           board.page.facts.epics,
    tickets:         board.page.tickets,
    foldedGroupKeys: new Set(foldedGroupKeys),
    axis:            {
      fromEpochMilliseconds:   chart.fromEpochMilliseconds,
      toEpochMilliseconds:     chart.toEpochMilliseconds,
      nowEpochMilliseconds,
      minimumSpanWidthPercent: board.limits.minimumBarWidthPercent,
      todayCalendarDate,
      slices:                  board.limits,
    },
  }), [chart, board, foldedGroupKeys, nowEpochMilliseconds, todayCalendarDate]);
  const [rowsChangedUnderHeldRange, rememberRowsAtChoice] = useRowsChangedUnderHeldRange(chart.shownRowSignature, chart.modeIsHeld);
  const [changedTaskIds, clearChange] = useChangedKeys(board, ProgressModel.changedTaskIdsBetween);
  useNowScrolledIntoView(chartRef, chart.nowPercent, `${JSON.stringify(override)} ${finishedWorkChoice}`);
  const coveringWidthProperty = useCoveringPanelWidthProperty();
  useChartPanelRoom(chartRef, routing.openItem, coveringWidthProperty);

  const axisPixelsNeeded = AxisFitUtil.axisPixelsNeededFor(chart.ticks);
  const axisWidthPixels = Math.max(trackWidthPixels, axisPixelsNeeded);
  const nowLabelSide = chart.nowPercent !== null && AxisFitUtil.nowLabelSitsLeftOfMarker(chart.nowPercent, axisWidthPixels) ? 'left' : undefined;
  const coveredTickLabels = useCoveredTickLabels(axisTrackRef, `${chart.ticks.map((tick) => tick.label).join(',')}@${axisWidthPixels}`);
  const chartStyle = { '--progress-timeline-min-width': `${axisPixelsNeeded}px` } as CSSProperties;

  const applyOverride = (next: StoredViewOverride): void => {
    rememberRowsAtChoice();
    chooseOverride(next);
  };
  const resolveBound = (text: string): number | null => ProgressModel.rangeBoundOf(board, text, nowEpochMilliseconds, cutoffEpochMilliseconds);
  const toggleGroup = (groupKey: string): void => chooseFoldedGroupKeys(EpicRowGrouping.foldedGroupKeysAfterToggle(foldedGroupKeys, groupKey));

  return (
    <div className="board-progress-view" data-name-column={nameColumnWidth} ref={viewElement} data-flint-workplace="">
      <PageHead
        titleElement="h2"
        title="Gantt"
        lead="Each ticket's builds and reviews over time, grouped by epic. Click a row to open it. Click its number to open the ticket."
      />
      <Row centerY between gap="twelve">
        <RangeControl
          chart={chart}
          appliedOverride={override}
          rowsChangedUnderHeldRange={rowsChangedUnderHeldRange}
          todayCalendarDate={todayCalendarDate}
          resolveBound={resolveBound}
          onApply={applyOverride}
        />
        <Menu label="Row options" trigger="button" align="end" triggerContent={<><Icon name="narrowing-lines" label={null} />Row options</>}>
          <MenuItem
            label="Review passes as rows"
            title="Draw each review pass as a row of its own, above its ticket's row"
            checked={reviewRowsAreShown}
            closing="return-focus"
            onChoose={() => chooseReviewRows(!reviewRowsAreShown)}
          />
          <MenuItem
            label="Wide titles"
            title="Widen the task column so full names fit"
            checked={nameColumnWidth === 'wide'}
            closing="return-focus"
            onChoose={() => chooseNameColumnWidth(ChartPreferenceUtil.toggledNameColumnWidth(nameColumnWidth))}
          />
        </Menu>
      </Row>
      <section ref={chartRef} className="board-progress-chart" aria-label="Gantt chart" style={chartStyle}>
        <div className="board-progress-row board-progress-chart-head">
          <div className="board-progress-name">
            <span className="board-progress-column-name" data-column="id">ID</span>
            <span className="board-progress-column-name" data-column="task">Task</span>
            <span className="board-progress-column-name" data-column="state">State</span>
          </div>
          <div ref={axisTrackRef} className="board-progress-track">
            {chart.ticks.map((tick, index) => (
              <div
                key={tick.leftPercent}
                className="board-progress-tick"
                data-covered={coveredTickLabels[index] === true ? '' : undefined}
                style={{ left: percent(tick.leftPercent) }}
              >
                <span className="board-progress-tick-label" data-label-side={AxisFitUtil.labelSitsLeftOfItsLine(tick, axisWidthPixels) ? 'left' : undefined}>
                  {tick.label}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="board-progress-rows">
          <div className="board-progress-overlay" aria-hidden="true">
            {chart.ticks.map((tick) => <div key={tick.leftPercent} className="board-progress-grid-line" style={{ left: percent(tick.leftPercent) }} />)}
            {chart.nowPercent === null
              ? null
              : (
                <div className="board-progress-now" data-label-side={nowLabelSide} style={{ left: percent(chart.nowPercent) }}>
                  <span className="board-progress-now-label">now</span>
                </div>
              )}
          </div>
          <ChartRows rows={chart.rows} groups={groups} onToggleGroup={toggleGroup} changedTaskIds={changedTaskIds} onChangeShown={clearChange} />
        </div>
        {chart.rows.length === 0 ? <p className="board-progress-empty">No tasks in this range.</p> : null}
      </section>
      <BoardLifetimeControls override={override} />
    </div>
  );
}
