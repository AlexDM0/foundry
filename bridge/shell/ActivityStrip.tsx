/**
 * The activity strip under the title row: one line per agent at work, its kind, ticket, title and the time it has run, ticking each
 * second from the injected clock while the event stream is live; with no agent, the idle line. The strip is a polite live region, so its
 * ticking times are hidden from assistive technology.
 */
import { useEffect, useState } from 'react';

import { ActivityStripModel, IDLE_ACTIVITY_TEXT, type ActivityEntry } from './ActivityStripModel.ts';
import type { BridgeClock }                                           from './BridgeClock.ts';

export interface ActivityStripProps {
  readonly entries: readonly ActivityEntry[];
  readonly isLive:  boolean;
  readonly clock:   BridgeClock;
}

/** The clock's moment, moved on each second only while the strip is live and has an agent to time. */
function useTickingNow(clock: BridgeClock, ticks: boolean): number {
  const [now, setNow] = useState(() => clock.now().getTime());
  useEffect(() => (ticks ? clock.everySecond(() => setNow(clock.now().getTime())) : undefined), [clock, ticks]);
  return now;
}

export function ActivityStrip({ entries, isLive, clock }: ActivityStripProps) {
  const now = useTickingNow(clock, isLive && entries.length > 0);
  return (
    <div className="bridge-activity" role="status" aria-live="polite" aria-label="Agents at work" data-freshness={isLive ? 'live' : 'snapshot'}>
      {entries.length === 0
        ? <div className="bridge-activity-idle">{IDLE_ACTIVITY_TEXT}</div>
        : entries.map((entry) => (
          <div key={entry.taskId} className="bridge-activity-row" data-state={entry.stateToken}>
            <span className="bridge-activity-dot" aria-hidden="true" />
            <span className="bridge-activity-kind">{entry.kindLabel}</span>
            {entry.ticketId === null ? null : <span className="bridge-activity-id">{`#${entry.ticketId}`}</span>}
            <span className="bridge-activity-title" title={entry.title}>{entry.title}</span>
            <span className="bridge-activity-elapsed" aria-hidden="true">{ActivityStripModel.elapsedTextOf(entry, now)}</span>
          </div>
        ))}
    </div>
  );
}
