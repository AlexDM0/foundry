/**
 * The "Agents at work" strip under the title row: a head line with the building and reviewing counts, how many launch slots are in use and,
 * at its far end, a warning flag for in-progress tickets with no Hephaestus job; under it one chip per job holding a launch slot (its id,
 * role, ticket title and the time since it launched, linking to the job on the Agents tab). On the Kanban tab it opens with Flint's slot,
 * the habitat cued by the first running job. The times tick each second from the injected clock while the event stream is live. The
 * strip is a polite live region, so its ticking times are hidden from assistive technology.
 */
import { MicroCapsLabel, Tag } from '../../lib/design-system/DesignSystemInterface.ts';

import { CountTextUtil }                  from '../../shared/utils/CountTextUtil.ts';
import { FlintSlotHabitat }               from '../flint/FlintSlotHabitat.tsx';
import { FLINT_SLOT_HABITATS }            from '../flint/FlintSlotHabitats.ts';
import { useTickingNow, type BoardClock } from '../shared/BoardClock.ts';
import { useChangedSinceMount }           from '../shared/ChangedSinceMount.ts';
import { useBoardHrefOf }                 from '../shared/routing/BoardRouteLinks.ts';
import { FlintSlotCueUtil }               from '../utils/FlintSlotCueUtil.ts';
import type { PresentItem }               from '../utils/ItemPresenceUtil.ts';
import { StateToneUtil }                  from '../utils/StateToneUtil.ts';
import {
  ActivityStripModel,
  IDLE_ACTIVITY_TEXT,
  type ActivityStripFacts,
  type WorkerChip
} from './ActivityStripModel.ts';
import { presenceAttributeOf, useItemPresence } from './ItemPresence.ts';

export interface ActivityStripProps {
  readonly facts:          ActivityStripFacts;
  readonly isLive:         boolean;
  readonly clock:          BoardClock;
  /** Only the Kanban tab's strip holds Flint's slot. */
  readonly showsFlintSlot: boolean;
}

const STRIP_LABEL = 'Agents at work';

function withoutJobFlagTitleOf(count: number): string {
  return CountTextUtil.countedPhrase(
    count,
    'ticket is in progress on the board with no Hephaestus job behind it',
    'tickets are in progress on the board with no Hephaestus job behind them'
  );
}

function slotsInUseTextOf(facts: ActivityStripFacts): string | null {
  return facts.slotLimit === null ? null : `${facts.chips.length} of ${facts.slotLimit} launch slots in use`;
}

function ActivityCounts({ facts }: { readonly facts: ActivityStripFacts }) {
  const buildingCountHasChanged = useChangedSinceMount(facts.buildingCount);
  const reviewingCountHasChanged = useChangedSinceMount(facts.reviewingCount);
  return (
    <span className="board-activity-counts">
      <span className="board-activity-dot" data-state="in-progress" data-state-tone={StateToneUtil.toneOf('in-progress')} aria-hidden="true" />
      <span key={`building-${facts.buildingCount}`} className="board-activity-count-figure" data-value-changed={buildingCountHasChanged ? '' : undefined}>
        {facts.buildingCount}
      </span>
      <span className="board-activity-count-label">building</span>
      <span className="board-activity-count-separator" aria-hidden="true">·</span>
      <span className="board-activity-dot" data-state="reviewing" data-state-tone={StateToneUtil.toneOf('reviewing')} aria-hidden="true" />
      <span key={`reviewing-${facts.reviewingCount}`} className="board-activity-count-figure" data-value-changed={reviewingCountHasChanged ? '' : undefined}>
        {facts.reviewingCount}
      </span>
      <span className="board-activity-count-label">reviewing</span>
    </span>
  );
}

/** A job that launches pops in; one that ends fades out where it stood. */
function WorkerJobChips({ presentChips, now }: { readonly presentChips: readonly PresentItem<WorkerChip>[]; readonly now: Date }) {
  const hrefOf = useBoardHrefOf();
  return (
    <span className="board-activity-jobs" aria-label="Worker jobs">
      {presentChips.map(({ item: chip, presence }) => {
        const elapsed = ActivityStripModel.elapsedTextOf(chip, now);
        const name = `Job ${chip.jobId}, ${chip.roleLabel}, ${chip.title}`;
        return (
          <a
            key={chip.jobId}
            className="board-activity-job"
            data-presence={presenceAttributeOf(presence)}
            inert={presence === 'leaving'}
            data-state={chip.stateToken}
            data-state-tone={StateToneUtil.toneOf(chip.stateToken)}
            href={hrefOf({ tab: 'agents', item: chip.jobId })}
            title={name}
            aria-label={name}
          >
            <span className="board-activity-dot" aria-hidden="true" />
            <span className="board-activity-job-id">{chip.jobId}</span>
            <span className="board-activity-job-role">{chip.roleLabel}</span>
            <span className="board-activity-job-title">{chip.title}</span>
            {elapsed === '' ? null : <span className="board-activity-job-elapsed" aria-hidden="true">{elapsed}</span>}
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
  const presentChips = useItemPresence(facts.chips, (chip) => chip.jobId);
  const slotsInUse = slotsInUseTextOf(facts);
  const hrefOf = useBoardHrefOf();
  return (
    <div className="board-activity" role="status" aria-live="polite" aria-label={STRIP_LABEL} data-freshness={isLive ? 'live' : 'snapshot'}>
      {showsFlintSlot
        ? <FlintSlotHabitat habitat={FLINT_SLOT_HABITATS.kanban} cue={FlintSlotCueUtil.cueOfJobs(facts.chips)} label={null} ground="strip" />
        : null}
      <div className="board-activity-body">
        <div className="board-activity-head">
          <MicroCapsLabel text={STRIP_LABEL} />
          {facts.chips.length === 0 ? null : <ActivityCounts facts={facts} />}
          <span className="board-activity-spacer" />
          {slotsInUse === null ? null : <span className="board-activity-slots">{slotsInUse}</span>}
          {facts.ticketCountWithoutJob === 0
            ? null
            : (
              <Tag
                text={`${facts.ticketCountWithoutJob} in progress with no Hephaestus job`}
                tone="warn"
                glyph="warning"
                href={hrefOf({ tab: 'agents', item: null })}
                title={withoutJobFlagTitleOf(facts.ticketCountWithoutJob)}
              />
            )}
        </div>
        {presentChips.length === 0
          ? <span className="board-activity-idle">{IDLE_ACTIVITY_TEXT}</span>
          : <WorkerJobChips presentChips={presentChips} now={now} />}
      </div>
    </div>
  );
}
