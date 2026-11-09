/**
 * The Progress tab: one card holding the Gantt chart of `ProgressModel`, its sticky head carrying the range menu and the row options in the
 * pinned cell and the axis ticks on the track, its rows grouped by epic on a board with epics. Bars, ticks, spans and the now line are
 * placed through the `style` prop. The range, the name column, the folded groups and the review-rows choice are kept per viewer under the
 * static page's keys. A row opens its row detail in place; its number links to its ticket on Tickets, an epic head's name to that epic.
 */
import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type RefObject
} from 'react';

import type { ProgressBoardState }                                          from '../../@types/ProgressBoardState.ts';
import { EpicChips }                                                        from '../../chips/EpicChips.tsx';
import type { PreferenceStore }                                             from '../../preferences/PreferenceStore.ts';
import { DetailRoute }                                                      from '../../shell/DetailRoute.ts';
import { useDetailRouting }                                                 from '../../shell/DetailRouting.ts';
import { useFinishedWorkWindow }                                            from '../../shell/FinishedWorkWindow.ts';
import { HashRouter }                                                       from '../../shell/HashRouter.ts';
import { GeometryUtil }                                                     from '../../utils/GeometryUtil.ts';
import { CustomRangePopover }                                               from './CustomRangePopover.tsx';
import { EpicRowGrouping, type EpicGroupHeadModel, type EpicRowGroup }      from './EpicRowGrouping.ts';
import { CLOSES_MENU_KEEPING_FOCUS, CLOSES_MENU_RETURNING_FOCUS, HeadMenu } from './HeadMenu.tsx';
import {
  ProgressModel,
  RANGE_PRESET_KEYS,
  type ProgressBarModel,
  type ProgressRowModel
} from './ProgressModel.ts';
import { progressPreferencesOf }                        from './ProgressPreferences.ts';
import { CUSTOM_RANGE_PRESET, FIT_RANGE_PRESET }        from './constants/ProgressChart.ts';
import { AxisFitUtil }                                  from './utils/AxisFitUtil.ts';
import { ChartPreferenceUtil, type StoredViewOverride } from './utils/ChartPreferenceUtil.ts';
import { RangePresetUtil }                              from './utils/RangePresetUtil.ts';

export interface ProgressViewProps {
  readonly boardState:           ProgressBoardState;
  /** The board's own preferences; `null` until the Overseer named its tracker. */
  readonly boardStore:           PreferenceStore | null;
  readonly nowEpochMilliseconds: number;
  readonly todayCalendarDate:    string;
}

const FOLD_CARET = '▾';
const FIT_PRESET_TITLE = 'Fit the range to the rows shown: from the earliest start to now. Follows the finished-work choice.';

function ticketRowHrefOf(ticketId: string): string {
  return HashRouter.fragmentOf({ tab: 'tickets', item: DetailRoute.itemTextOf({ form: 'ticket-row', ticketId }) });
}

/** Three lines that get shorter, the static page's row options glyph. */
function RowOptionsIcon() {
  return (
    <svg className="bridge-icon" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M2 4h12M4 8h8M6 12h4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function percent(value: number): string {
  return `${value}%`;
}

function presetLabelOf(presetKey: string): string {
  return RangePresetUtil.modeLabelOf(presetKey);
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

function ChartRow({ row }: { readonly row: ProgressRowModel }) {
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
      data-review-of={row.nestedWithTicket ?? undefined}
      data-live={row.isLive ? '' : undefined}
      data-selected={routing.isOpen(detailItem) ? '' : undefined}
      onClick={(event) => {
        if (clickOpensRow(event)) routing.toggle(detailItem);
      }}
      onKeyDown={toggleOnKey}
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

function ChartRows({ rows, groups, onToggleGroup }: {
  readonly rows:          readonly ProgressRowModel[];
  readonly groups:        readonly EpicRowGroup<ProgressRowModel>[] | null;
  readonly onToggleGroup: (groupKey: string) => void;
}) {
  if (groups === null) return <>{rows.map((row) => <ChartRow key={row.taskId} row={row} />)}</>;
  return (
    <>
      {groups.map((group) => [
        <GroupHeadRow key={`head-${group.head.key}`} head={group.head} onToggle={onToggleGroup} />,
        ...group.rows.map((row) => <ChartRow key={row.taskId} row={row} />),
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

/** The range button's dot: the rows drawn changed under a held range since it was last chosen. */
function useRowsChangedUnderHeldRange(shownRowSignature: string, modeIsHeld: boolean): [boolean, () => void] {
  const [signatureAtChoice, setSignatureAtChoice] = useState(shownRowSignature);
  const rememberRows = useCallback(() => setSignatureAtChoice(shownRowSignature), [shownRowSignature]);
  return [modeIsHeld && signatureAtChoice !== shownRowSignature, rememberRows];
}

export function ProgressView({
  boardState, boardStore, nowEpochMilliseconds, todayCalendarDate
}: ProgressViewProps) {
  const preferences = useMemo(() => progressPreferencesOf(boardStore), [boardStore]);
  const { cutoffEpochMilliseconds } = useFinishedWorkWindow();
  const [override, chooseOverride] = useStoredChoice(preferences.readRangeOverride, preferences.writeRangeOverride);
  const [reviewRowsAreShown, chooseReviewRows] = useStoredChoice(preferences.readReviewRowsAreShown, preferences.writeReviewRowsAreShown);
  const [nameColumnWidth, chooseNameColumnWidth] = useStoredChoice(preferences.readNameColumnWidth, preferences.writeNameColumnWidth);
  const [foldedGroupKeys, chooseFoldedGroupKeys] = useStoredChoice(preferences.readFoldedEpicGroups, preferences.writeFoldedEpicGroups);
  const [customRangeIsOpen, setCustomRangeIsOpen] = useState(false);
  const rangeButtonRef = useRef<HTMLButtonElement | null>(null);
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

  const axisPixelsNeeded = AxisFitUtil.axisPixelsNeededFor(chart.ticks);
  const axisWidthPixels = Math.max(trackWidthPixels, axisPixelsNeeded);
  const nowLabelSide = chart.nowPercent !== null && AxisFitUtil.nowLabelSitsLeftOfMarker(chart.nowPercent, axisWidthPixels) ? 'left' : undefined;
  const coveredTickLabels = useCoveredTickLabels(axisTrackRef, `${chart.ticks.map((tick) => tick.label).join(',')}@${axisWidthPixels}`);
  const chartStyle = { '--progress-timeline-min-width': `${axisPixelsNeeded}px` } as CSSProperties;
  const refitMark = rowsChangedUnderHeldRange ? '' : undefined;

  const applyOverride = (next: StoredViewOverride): void => {
    rememberRowsAtChoice();
    chooseOverride(next);
  };
  const choosePreset = (presetKey: string): void => applyOverride(RangePresetUtil.overrideOfPreset(presetKey, override));
  const resolveBound = (text: string): number | null => ProgressModel.rangeBoundOf(boardState, text, nowEpochMilliseconds, cutoffEpochMilliseconds);
  const closeCustomRange = useCallback((returnFocus: boolean) => {
    setCustomRangeIsOpen(false);
    if (returnFocus) rangeButtonRef.current?.focus();
  }, []);
  const toggleGroup = (groupKey: string): void => chooseFoldedGroupKeys(EpicRowGrouping.foldedGroupKeysAfterToggle(foldedGroupKeys, groupKey));

  return (
    <div className="bridge-progress-view" data-name-column={nameColumnWidth}>
      <section className="bridge-progress-chart" aria-label="Progress chart" style={chartStyle}>
        <div className="bridge-progress-row bridge-progress-chart-head">
          <div className="bridge-progress-name">
            <HeadMenu
              label="Range"
              variant="range"
              buttonRef={rangeButtonRef}
              refit={rowsChangedUnderHeldRange}
              buttonContent={(
                <>
                  <span className="bridge-range-summary">
                    <span className="bridge-range-mode" data-held={chart.modeIsHeld ? '' : undefined} title={chart.modeTitle}>{chart.modeLabel}</span>
                    <span className="bridge-range-ends">{chart.rangeEndsText}</span>
                  </span>
                  <span className="bridge-range-caret" aria-hidden="true">{FOLD_CARET}</span>
                </>
              )}
            >
              <p className="bridge-progress-range-note" title={chart.rangeNoteTitle}>{chart.rangeNoteText}</p>
              {RANGE_PRESET_KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  className="bridge-menu-item"
                  aria-pressed={key === chart.pressedPreset}
                  data-refit={key === FIT_RANGE_PRESET ? refitMark : undefined}
                  title={key === FIT_RANGE_PRESET ? FIT_PRESET_TITLE : undefined}
                  data-closes-menu={CLOSES_MENU_RETURNING_FOCUS}
                  onClick={() => choosePreset(key)}
                >
                  <span>{presetLabelOf(key)}</span>
                  {key === FIT_RANGE_PRESET ? <span className="bridge-menu-hint">the rows shown</span> : null}
                </button>
              ))}
              <button
                type="button"
                className="bridge-menu-item"
                aria-pressed={chart.pressedPreset === CUSTOM_RANGE_PRESET}
                aria-haspopup="dialog"
                aria-expanded={customRangeIsOpen}
                data-closes-menu={CLOSES_MENU_KEEPING_FOCUS}
                onClick={() => setCustomRangeIsOpen(true)}
              >
                <span>Custom…</span>
                <span className="bridge-menu-hint">from, to, ticks</span>
              </button>
            </HeadMenu>
            {customRangeIsOpen
              ? (
                <CustomRangePopover
                  appliedOverride={override}
                  resolveBound={resolveBound}
                  todayCalendarDate={todayCalendarDate}
                  onApply={applyOverride}
                  onClose={closeCustomRange}
                />
              )
              : null}
            <HeadMenu label="Row options" variant="icon" buttonName="Row options" buttonTitle="Row options" buttonContent={<RowOptionsIcon />}>
              <button
                type="button"
                className="bridge-menu-item"
                aria-pressed={reviewRowsAreShown}
                title="Draw each review pass as a row of its own, above its ticket's row"
                data-closes-menu={CLOSES_MENU_RETURNING_FOCUS}
                onClick={() => chooseReviewRows(!reviewRowsAreShown)}
              >
                <span>Review passes as rows</span>
                <span className="bridge-menu-check" aria-hidden="true">✓</span>
              </button>
              <button
                type="button"
                className="bridge-menu-item"
                aria-pressed={nameColumnWidth === 'wide'}
                title="Widen the task column so full names fit"
                data-closes-menu={CLOSES_MENU_RETURNING_FOCUS}
                onClick={() => chooseNameColumnWidth(ChartPreferenceUtil.toggledNameColumnWidth(nameColumnWidth))}
              >
                <span>Wide titles</span>
                <span className="bridge-menu-check" aria-hidden="true">✓</span>
              </button>
            </HeadMenu>
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
          <ChartRows rows={chart.rows} groups={groups} onToggleGroup={toggleGroup} />
        </div>
        {chart.rows.length === 0 ? <p className="bridge-progress-empty">No tasks in this range.</p> : null}
      </section>
    </div>
  );
}
