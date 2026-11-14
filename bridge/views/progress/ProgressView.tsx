/**
 * The Progress tab: its title row, the range control and the row options above one card holding the Gantt chart of `ProgressModel`, its
 * sticky head carrying the column names in the pinned cell and the axis ticks on the track, its rows grouped by epic on a board with
 * epics. Bars, ticks, spans and the now line are placed through the `style` prop. The range, the name column, the folded groups and the
 * review-rows choice are kept per viewer under their keys. A row opens its row detail in place; its number links to its ticket on
 * Tickets, an epic head's name to that epic. The tab is the timeline habitat of Flint
 * (`bridge/views/progress/UseTimelineHabitat.ts`).
 */

import { Icon }           from 'design-system/Icon';
import { Menu, MenuItem } from 'design-system/Menu';
import { Row }            from 'design-system/Row';
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

import type { ProgressBoardState }                                     from '../../@types/ProgressBoardState.ts';
import { EpicChips }                                                   from '../../chips/EpicChips.tsx';
import type { PreferenceStore }                                        from '../../preferences/PreferenceStore.ts';
import { useChangedKeys }                                              from '../../shell/ChangeHighlight.ts';
import { useCoveringPanelWidthProperty }                               from '../../shell/CoveringPanel.ts';
import { DetailRoute }                                                 from '../../shell/DetailRoute.ts';
import { useDetailRouting }                                            from '../../shell/DetailRouting.ts';
import { useFinishedWorkWindow }                                       from '../../shell/FinishedWorkWindow.ts';
import { HashRouter }                                                  from '../../shell/HashRouter.ts';
import { GeometryUtil }                                                from '../../utils/GeometryUtil.ts';
import { StateToneUtil }                                               from '../../utils/StateToneUtil.ts';
import { ViewTitle }                                                   from '../ViewTitle.tsx';
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
  readonly boardState:           ProgressBoardState;
  /** The board's own preferences; `null` until the Overseer named its tracker. */
  readonly boardStore:           PreferenceStore | null;
  readonly nowEpochMilliseconds: number;
  readonly todayCalendarDate:    string;
}

const FOLD_CARET = '▾';

function ticketRowHrefOf(ticketId: string): string {
  return HashRouter.fragmentOf({ tab: 'tickets', item: DetailRoute.itemTextOf({ form: 'ticket-row', ticketId }) });
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
      className="bridge-progress-bar"
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
  const detailItem = { form: 'task-row', taskId: row.taskId } as const;
  const toggleOnKey = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    routing.toggle(detailItem);
  };
  return (
    <div
      className="bridge-progress-row"
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
      <div className="bridge-progress-name">
        {row.linkedTicketId === null
          ? <span className="bridge-progress-number">{row.labelText}</span>
          : <a className="bridge-progress-number" href={ticketRowHrefOf(row.linkedTicketId)}>{row.labelText}</a>}
        <span className="bridge-progress-row-name" title={row.nameTitle}>{row.nameText}</span>
        <span className="bridge-progress-chip" title={row.chipTitle}>
          <span className="bridge-progress-chip-dot" aria-hidden="true" />
          <span className="bridge-progress-chip-word">{row.chipText}</span>
        </span>
      </div>
      <div className="bridge-progress-track">
        <span className="bridge-progress-clip" data-side="left" hidden={!row.clippedLeft} />
        {row.bars.map((bar) => <ChartBar key={bar.key} bar={bar} />)}
        <span className="bridge-progress-clip" data-side="right" hidden={!row.clippedRight} />
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
      className="bridge-progress-row bridge-progress-epic-head"
      data-epic-key={head.key}
      data-epic-slot={head.slot === null ? undefined : String(head.slot)}
      data-collapsed={head.isFolded ? '' : undefined}
      role="button"
      tabIndex={0}
      aria-expanded={!head.isFolded}
      onClick={() => onToggle(head.key)}
      onKeyDown={toggleOnKey}
    >
      <div className="bridge-progress-name">
        <span className="bridge-progress-epic-caret" aria-hidden="true">{FOLD_CARET}</span>
        {head.slot === null
          ? (
            <>
              {head.label}
              <span className="bridge-progress-epic-count">{String(head.memberCount)}</span>
            </>
          )
          : <EpicChips epics={[{ key: head.key, title: head.label, slot: head.slot }]} />}
        {head.sharedMemberCount === 0
          ? null
          : <span className="bridge-progress-epic-count" title={`${head.sharedMemberCount} of its tickets show under another epic`}>{`+${head.sharedMemberCount} shared`}</span>}
        {head.doneText === null ? null : <span className="bridge-progress-epic-done">{head.doneText}</span>}
      </div>
      <div className="bridge-progress-track">
        {head.span === null
          ? null
          : (
            <div
              className="bridge-progress-epic-span"
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
    const labels = [...track.querySelectorAll('.bridge-progress-tick-label')].map((label) => label.getBoundingClientRect());
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
    const pinnedColumn = chart.querySelector('.bridge-progress-chart-head > .bridge-progress-name');
    const axis = chart.querySelector('.bridge-progress-chart-head > .bridge-progress-track');
    chart.scrollLeft = AxisFitUtil.nowScrollLeftOf(shownNowPercent, {
      clientWidthPixels: chart.clientWidth,
      scrollWidthPixels: chart.scrollWidth,
      pinnedWidthPixels: pinnedColumn?.getBoundingClientRect().width ?? 0,
      axisWidthPixels:   axis?.getBoundingClientRect().width ?? 0,
    });
  }, [chartRef, scrollRequest]);
}

export function ProgressView({
  boardState, boardStore, nowEpochMilliseconds, todayCalendarDate
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
  useTimelineHabitat(viewElement, boardState);
  const axisTrackRef = useRef<HTMLDivElement | null>(null);
  const trackWidthPixels = useTrackWidthPixels(axisTrackRef);

  const chart = useMemo(
    () => ProgressModel.progressChartOf(boardState, {
      override, reviewRowsAreShown, nowEpochMilliseconds, todayCalendarDate, cutoffEpochMilliseconds
    }),
    [boardState, override, reviewRowsAreShown, nowEpochMilliseconds, todayCalendarDate, cutoffEpochMilliseconds],
  );
  const groups = useMemo(() => EpicRowGrouping.epicRowGroupsOf(chart.rows, {
    epics:           boardState.page.payload.boardFacts.epics,
    tickets:         boardState.page.tickets,
    foldedGroupKeys: new Set(foldedGroupKeys),
    axis:            {
      fromEpochMilliseconds:   chart.fromEpochMilliseconds,
      toEpochMilliseconds:     chart.toEpochMilliseconds,
      nowEpochMilliseconds,
      minimumSpanWidthPercent: boardState.page.payload.limits.minimumBarWidthPercent,
      todayCalendarDate,
      slices:                  boardState.page.payload.limits,
    },
  }), [chart, boardState, foldedGroupKeys, nowEpochMilliseconds, todayCalendarDate]);
  const [rowsChangedUnderHeldRange, rememberRowsAtChoice] = useRowsChangedUnderHeldRange(chart.shownRowSignature, chart.modeIsHeld);
  const [changedTaskIds, clearChange] = useChangedKeys(boardState, ProgressModel.changedTaskIdsBetween);
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
  const resolveBound = (text: string): number | null => ProgressModel.rangeBoundOf(boardState, text, nowEpochMilliseconds, cutoffEpochMilliseconds);
  const toggleGroup = (groupKey: string): void => chooseFoldedGroupKeys(EpicRowGrouping.foldedGroupKeysAfterToggle(foldedGroupKeys, groupKey));

  return (
    <div className="bridge-progress-view" data-name-column={nameColumnWidth} ref={viewElement} data-flint-workplace="">
      <ViewTitle
        title="Progress"
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
        <Menu label="Row options" trigger="icon" align="end" triggerName="Row options" triggerTitle="Row options" triggerContent={<Icon name="narrowing-lines" label={null} />}>
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
      <section ref={chartRef} className="bridge-progress-chart" aria-label="Progress chart" style={chartStyle}>
        <div className="bridge-progress-row bridge-progress-chart-head">
          <div className="bridge-progress-name">
            <span className="bridge-progress-column-name" data-column="id">ID</span>
            <span className="bridge-progress-column-name" data-column="task">Task</span>
            <span className="bridge-progress-column-name" data-column="state">State</span>
          </div>
          <div ref={axisTrackRef} className="bridge-progress-track">
            {chart.ticks.map((tick, index) => (
              <div
                key={tick.leftPercent}
                className="bridge-progress-tick"
                data-covered={coveredTickLabels[index] === true ? '' : undefined}
                style={{ left: percent(tick.leftPercent) }}
              >
                <span className="bridge-progress-tick-label" data-label-side={AxisFitUtil.labelSitsLeftOfItsLine(tick, axisWidthPixels) ? 'left' : undefined}>
                  {tick.label}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="bridge-progress-rows">
          <div className="bridge-progress-overlay" aria-hidden="true">
            {chart.ticks.map((tick) => <div key={tick.leftPercent} className="bridge-progress-grid-line" style={{ left: percent(tick.leftPercent) }} />)}
            {chart.nowPercent === null
              ? null
              : (
                <div className="bridge-progress-now" data-label-side={nowLabelSide} style={{ left: percent(chart.nowPercent) }}>
                  <span className="bridge-progress-now-label">now</span>
                </div>
              )}
          </div>
          <ChartRows rows={chart.rows} groups={groups} onToggleGroup={toggleGroup} changedTaskIds={changedTaskIds} onChangeShown={clearChange} />
        </div>
        {chart.rows.length === 0 ? <p className="bridge-progress-empty">No tasks in this range.</p> : null}
      </section>
      <BoardLifetimeControls override={override} />
    </div>
  );
}
