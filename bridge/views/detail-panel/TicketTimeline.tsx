/**
 * The ticket form's Timeline: the mini Gantt `TicketTimelineModel.ts` lays out, its legend and, for a ticket never started, its note. Bars and
 * ticks are placed by style; after layout, a tick label the end label would overlap is hidden.
 */
import {
  useLayoutEffect,
  useRef,
  useState,
  type RefObject
} from 'react';

import { GeometryUtil }                                                 from '../../utils/GeometryUtil.ts';
import type { TicketTimelineModel, TimelineBarModel, TimelineRowModel } from './TicketTimelineModel.ts';

function percentText(percent: number): string {
  return `${String(percent)}%`;
}

function TimelineBar({ bar }: { readonly bar: TimelineBarModel }) {
  const placement = { left: percentText(bar.leftPercent), width: percentText(bar.widthPercent) };
  const live = bar.isLive ? '' : undefined;
  switch (bar.kind) {
    case 'filed':
      return <div className="bridge-ticket-gantt-bar bridge-ticket-gantt-filed" style={placement} title={bar.title} />;
    case 'build':
      return <div className="bridge-ticket-gantt-bar bridge-ticket-gantt-segment" data-state={bar.state ?? undefined} data-live={live} style={placement} title={bar.title} />;
    case 'lifecycle':
      return <div className="bridge-ticket-gantt-bar bridge-ticket-gantt-lifecycle" data-state={bar.state ?? undefined} style={placement} title={bar.title}>{bar.label}</div>;
    default:
      return <div className="bridge-ticket-gantt-bar" data-state={bar.state ?? undefined} data-live={live} style={placement} title={bar.title} />;
  }
}

function TimelineRow({ row }: { readonly row: TimelineRowModel }) {
  return (
    <div className="bridge-ticket-gantt-row">
      <div className="bridge-ticket-gantt-name">
        <span className="bridge-ticket-gantt-row-name" title={row.nameTitle ?? undefined}>
          {row.name}
          {row.monoText === null ? null : <>{' '}<span className="bridge-ticket-gantt-mono">{row.monoText}</span></>}
        </span>
      </div>
      <div className="bridge-ticket-gantt-time">{row.timeText}</div>
      <div className="bridge-ticket-gantt-track">
        {row.bars.map((bar) => <TimelineBar key={bar.key} bar={bar} />)}
      </div>
    </div>
  );
}

/** One flag per tick, measured after layout: a label the end label covers is hidden. */
function useCoveredTickLabels(model: TicketTimelineModel): { ticks: RefObject<HTMLDivElement | null>; covered: readonly boolean[] } {
  const ticks = useRef<HTMLDivElement>(null);
  const [covered, setCovered] = useState<readonly boolean[]>([]);
  useLayoutEffect(() => {
    const container = ticks.current;
    const endLabel = container?.querySelector('.bridge-ticket-gantt-end-label') ?? null;
    if (container === null || endLabel === null) return;
    const labels = [...container.querySelectorAll('.bridge-ticket-gantt-tick > span')].map((label) => label.getBoundingClientRect());
    const measured = GeometryUtil.coveredTickLabels(labels, [endLabel.getBoundingClientRect()]);
    setCovered((previous) => (previous.length === measured.length && previous.every((flag, index) => flag === measured[index]) ? previous : measured));
  }, [model]);
  return { ticks, covered };
}

export function TicketTimeline({ model }: { readonly model: TicketTimelineModel }) {
  const { ticks, covered } = useCoveredTickLabels(model);
  const { end } = model;
  const endState = end.closedState ?? undefined;
  return (
    <>
      <div className="bridge-ticket-gantt">
        <div className="bridge-ticket-gantt-row bridge-ticket-gantt-head">
          <div className="bridge-ticket-gantt-name">Row</div>
          <div className="bridge-ticket-gantt-time">Time</div>
          <div className="bridge-ticket-gantt-ticks" ref={ticks}>
            {model.ticks.map((tick, index) => (
              <div
                key={`${tick.label}:${String(tick.leftPercent)}`}
                className="bridge-ticket-gantt-tick"
                data-covered={covered[index] === true ? '' : undefined}
                style={{ left: percentText(tick.leftPercent) }}
              >
                <span>{tick.label}</span>
              </div>
            ))}
            <span className="bridge-ticket-gantt-end-label" data-state={endState} style={{ left: percentText(end.leftPercent) }}>{end.label}</span>
          </div>
        </div>
        <div className="bridge-ticket-gantt-body">
          <div className="bridge-ticket-gantt-overlay">
            {model.ticks.map((tick) => (
              <div key={`${tick.label}:${String(tick.leftPercent)}`} className="bridge-ticket-gantt-grid-line" style={{ left: percentText(tick.leftPercent) }} />
            ))}
            <div className="bridge-ticket-gantt-end" data-state={endState} style={{ left: percentText(end.leftPercent) }} />
          </div>
          {model.rows.map((row) => <TimelineRow key={row.key} row={row} />)}
        </div>
      </div>
      <ul className="bridge-ticket-gantt-legend" aria-label="Time spent in each state">
        {model.legend.map((entry) => (
          <li key={entry.label}>
            <span className="bridge-ticket-gantt-swatch" data-state={entry.state} />
            <b>{entry.label}</b>
            <time>{entry.durationText}</time>
          </li>
        ))}
      </ul>
      {model.note === null ? null : <p className="bridge-ticket-gantt-note">{model.note}</p>}
    </>
  );
}
