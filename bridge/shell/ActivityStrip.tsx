/**
 * The activity strip under the title row, one line: the building and reviewing counts, one chip per job holding a launch slot (its id,
 * role, ticket title and the time since it launched, linking to the job on the Agents tab), and at the far end a warning flag for
 * in-progress tickets with no Overseer job. The times tick each second from the injected clock while the event stream is live. The strip is
 * a polite live region, so its ticking times are hidden from assistive technology.
 */
import { useEffect, useState } from 'react';

import { Tag }                                                             from '../design-system/Tag.tsx';
import { ActivityStripModel, IDLE_ACTIVITY_TEXT, type ActivityStripFacts } from './ActivityStripModel.ts';
import type { BridgeClock }                                                from './BridgeClock.ts';
import { HashRouter }                                                      from './HashRouter.ts';

export interface ActivityStripProps {
  readonly facts:  ActivityStripFacts;
  readonly isLive: boolean;
  readonly clock:  BridgeClock;
}

/** The clock's moment, moved on each second only while the strip is live and has a job to time. */
function useTickingNow(clock: BridgeClock, ticks: boolean): Date {
  const [now, setNow] = useState(() => clock.now());
  useEffect(() => (ticks ? clock.everySecond(() => setNow(clock.now())) : undefined), [clock, ticks]);
  return now;
}

function withoutJobFlagTitleOf(count: number): string {
  return count === 1
    ? '1 ticket is in progress on the board with no Overseer job behind it'
    : `${count} tickets are in progress on the board with no Overseer job behind them`;
}

export function ActivityStrip({ facts, isLive, clock }: ActivityStripProps) {
  const now = useTickingNow(clock, isLive && facts.chips.length > 0);
  return (
    <div className="bridge-activity" role="status" aria-live="polite" aria-label="Agents at work" data-freshness={isLive ? 'live' : 'snapshot'}>
      {facts.chips.length === 0
        ? <span className="bridge-activity-idle">{IDLE_ACTIVITY_TEXT}</span>
        : (
          <>
            <span className="bridge-activity-counts" data-state="in-progress">
              <span className="bridge-activity-dot" aria-hidden="true" />
              <span className="bridge-activity-count-figure">{facts.buildingCount}</span>
              <span className="bridge-activity-count-label">building</span>
              <span className="bridge-stat-separator" aria-hidden="true">·</span>
              <span className="bridge-activity-count-figure">{facts.reviewingCount}</span>
              <span className="bridge-activity-count-label">reviewing</span>
            </span>
            <span className="bridge-activity-jobs" aria-label="Worker jobs">
              {facts.chips.map((chip) => {
                const elapsed = ActivityStripModel.elapsedTextOf(chip, now);
                const name = `Job ${chip.jobId}, ${chip.roleLabel}, ${chip.title}`;
                return (
                  <a
                    key={chip.jobId}
                    className="bridge-activity-job"
                    data-state={chip.stateToken}
                    href={HashRouter.fragmentOf({ tab: 'agents', item: chip.jobId })}
                    title={name}
                    aria-label={name}
                  >
                    <span className="bridge-activity-job-id">{chip.jobId}</span>
                    <span className="bridge-activity-job-role">{chip.roleLabel}</span>
                    <span className="bridge-activity-job-title">{chip.title}</span>
                    {elapsed === '' ? null : <span className="bridge-activity-job-elapsed" aria-hidden="true">{elapsed}</span>}
                  </a>
                );
              })}
            </span>
          </>
        )}
      <span className="bridge-activity-spacer" />
      {facts.ticketCountWithoutJob === 0
        ? null
        : (
          <Tag
            text={`${facts.ticketCountWithoutJob} in progress with no Overseer job`}
            tone="warn"
            glyph="warning"
            href={HashRouter.fragmentOf({ tab: 'agents', item: null })}
            title={withoutJobFlagTitleOf(facts.ticketCountWithoutJob)}
          />
        )}
    </div>
  );
}
