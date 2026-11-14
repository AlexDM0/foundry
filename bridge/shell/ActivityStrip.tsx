/**
 * The "Agents at work" strip under the title row: a head line with the building and reviewing counts, how many launch slots are in use and,
 * at its far end, a warning flag for in-progress tickets with no Overseer job; under it one chip per job holding a launch slot (its id,
 * role, ticket title and the time since it launched, linking to the job on the Agents tab). On the Kanban tab it opens with Flint's slot,
 * posed for the first running job. The times tick each second from the injected clock while the event stream is live. The strip is a
 * polite live region, so its ticking times are hidden from assistive technology.
 */
import { FlintSlot }      from 'design-system/FlintSlot';
import { MicroCapsLabel } from 'design-system/MicroCapsLabel';
import { Tag }            from 'design-system/Tag';

import { FlintPoseUtil }                                                   from '../utils/FlintPoseUtil.ts';
import { StateToneUtil }                                                   from '../utils/StateToneUtil.ts';
import { ActivityStripModel, IDLE_ACTIVITY_TEXT, type ActivityStripFacts } from './ActivityStripModel.ts';
import { useTickingNow, type BridgeClock }                                 from './BridgeClock.ts';
import { HashRouter }                                                      from './HashRouter.ts';

export interface ActivityStripProps {
  readonly facts:          ActivityStripFacts;
  readonly isLive:         boolean;
  readonly clock:          BridgeClock;
  /** Only the Kanban tab's strip holds Flint's slot. */
  readonly showsFlintSlot: boolean;
}

const STRIP_LABEL = 'Agents at work';

function withoutJobFlagTitleOf(count: number): string {
  return count === 1
    ? '1 ticket is in progress on the board with no Overseer job behind it'
    : `${count} tickets are in progress on the board with no Overseer job behind them`;
}

function slotsInUseTextOf(facts: ActivityStripFacts): string | null {
  return facts.slotLimit === null ? null : `${facts.chips.length} of ${facts.slotLimit} launch slots in use`;
}

function ActivityCounts({ facts }: { readonly facts: ActivityStripFacts }) {
  return (
    <span className="bridge-activity-counts">
      <span className="bridge-activity-dot" data-state="in-progress" data-state-tone={StateToneUtil.toneOf('in-progress')} aria-hidden="true" />
      <span className="bridge-activity-count-figure">{facts.buildingCount}</span>
      <span className="bridge-activity-count-label">building</span>
      <span className="bridge-activity-count-separator" aria-hidden="true">·</span>
      <span className="bridge-activity-dot" data-state="reviewing" data-state-tone={StateToneUtil.toneOf('reviewing')} aria-hidden="true" />
      <span className="bridge-activity-count-figure">{facts.reviewingCount}</span>
      <span className="bridge-activity-count-label">reviewing</span>
    </span>
  );
}

function WorkerJobChips({ facts, now }: { readonly facts: ActivityStripFacts; readonly now: Date }) {
  return (
    <span className="bridge-activity-jobs" aria-label="Worker jobs">
      {facts.chips.map((chip) => {
        const elapsed = ActivityStripModel.elapsedTextOf(chip, now);
        const name = `Job ${chip.jobId}, ${chip.roleLabel}, ${chip.title}`;
        return (
          <a
            key={chip.jobId}
            className="bridge-activity-job"
            data-state={chip.stateToken}
            data-state-tone={StateToneUtil.toneOf(chip.stateToken)}
            href={HashRouter.fragmentOf({ tab: 'agents', item: chip.jobId })}
            title={name}
            aria-label={name}
          >
            <span className="bridge-activity-dot" aria-hidden="true" />
            <span className="bridge-activity-job-id">{chip.jobId}</span>
            <span className="bridge-activity-job-role">{chip.roleLabel}</span>
            <span className="bridge-activity-job-title">{chip.title}</span>
            {elapsed === '' ? null : <span className="bridge-activity-job-elapsed" aria-hidden="true">{elapsed}</span>}
          </a>
        );
      })}
    </span>
  );
}

export function ActivityStrip({
  facts, isLive, clock, showsFlintSlot
}: ActivityStripProps) {
  const now = useTickingNow(clock, isLive && facts.chips.length > 0);
  const slotsInUse = slotsInUseTextOf(facts);
  return (
    <div className="bridge-activity" role="status" aria-live="polite" aria-label={STRIP_LABEL} data-freshness={isLive ? 'live' : 'snapshot'}>
      {showsFlintSlot ? <FlintSlot label={null} size="100" ground="strip" pose={FlintPoseUtil.poseOfJobs(facts.chips)} /> : null}
      <div className="bridge-activity-body">
        <div className="bridge-activity-head">
          <MicroCapsLabel text={STRIP_LABEL} />
          {facts.chips.length === 0 ? null : <ActivityCounts facts={facts} />}
          <span className="bridge-activity-spacer" />
          {slotsInUse === null ? null : <span className="bridge-activity-slots">{slotsInUse}</span>}
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
        {facts.chips.length === 0
          ? <span className="bridge-activity-idle">{IDLE_ACTIVITY_TEXT}</span>
          : <WorkerJobChips facts={facts} now={now} />}
      </div>
    </div>
  );
}
