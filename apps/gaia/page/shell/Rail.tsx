/**
 * The 232 px rail under the brand bar: the four views with their counts, one row per forge or the line saying there is none, and this
 * machine with its slot meter. Every row is a link to its route; the current one carries `aria-current`. A forge with no pipeline says so
 * under its name, and a dashed Set up stands in its count's place while nothing else of it waits.
 */
import { ConditionDot } from '../components/ConditionDot.tsx';
import {
  CountBadge,
  MicroCapsLabel,
  SlotMeter,
  Tag
} from '../lib/design-system/DesignSystemInterface.ts';

import type { MachineLoad } from '../shared/MachineLoadModel.ts';
import type {
  RailContent,
  RailCount,
  RailCountMark,
  RailForgeRow
} from './RailModel.ts';

const MACHINE_HREF = '#forges';
const FORGES_HEAD_ID = 'gaia-rail-forges-head';

const SET_UP_LABEL = 'Set up';

/** What a count's mark says, as its holder's tooltip, since the mark itself is only the badge's qualifier. */
const MARK_TITLES: Readonly<Record<Exclude<RailCountMark, ''>, string>> = {
  '+': 'more possible',
  '?': 'as last reported',
};

/** What waits on User is in the warn colours; every other count is plain on the rail's wash, as the boards draw it. */
function RailCountBadge({ count }: { readonly count: RailCount | null }) {
  if (count === null) return null;
  const tone = count.tone === 'attention' ? 'warn' : 'plain';
  if (count.mark === '') return <span className="gaia-rail-count"><CountBadge count={count.count} tone={tone} /></span>;
  return <span className="gaia-rail-count" title={MARK_TITLES[count.mark]}><CountBadge count={count.count} qualifier={count.mark} tone={tone} /></span>;
}

function RailMachineLink({ machine }: { readonly machine: MachineLoad }) {
  return (
    <a className="gaia-rail-machine" href={MACHINE_HREF} data-at-the-limit={machine.isAtTheLimit ? '' : undefined}>
      <MicroCapsLabel text="This machine" />
      <span className="gaia-rail-machine-agents">
        <span className="gaia-rail-machine-figure">{machine.agentsText}</span>
        <span className="gaia-rail-machine-unit">agents</span>
      </span>
      <SlotMeter label={machine.meter.label} filled={machine.meter.filled} limit={machine.meter.slots} tone="accent" wrap />
      {machine.atTheLimitLine === null ? null : <span className="gaia-rail-machine-at-the-limit">{machine.atTheLimitLine}</span>}
      <span className="gaia-rail-machine-line">{machine.limitLine}</span>
    </a>
  );
}

/** The forge's name, and under it where its setup stands while it has no pipeline. */
function RailForgeName({ row }: { readonly row: RailForgeRow }) {
  if (row.setupLine === null) return <span className="gaia-rail-row-label">{row.project}</span>;
  return (
    <span className="gaia-rail-row-lines">
      <span className="gaia-rail-row-label">{row.project}</span>
      <span className="gaia-rail-row-setup">{row.setupLine}</span>
    </span>
  );
}

export function Rail({ content }: { readonly content: RailContent }) {
  return (
    <nav className="gaia-rail" aria-label="Gaia">
      <div className="gaia-rail-group">
        {content.views.map((row) => (
          <a key={row.view} className="gaia-rail-row" href={row.href} aria-current={row.isCurrent ? 'page' : undefined}>
            <span className="gaia-rail-row-label">{row.label}</span>
            <RailCountBadge count={row.count} />
          </a>
        ))}
      </div>
      {content.forges.length === 0 && content.noForgeLine === null ? null : (
        <div className="gaia-rail-group" role="group" aria-labelledby={FORGES_HEAD_ID}>
          <div className="gaia-rail-group-head">
            <MicroCapsLabel text="Forges" id={FORGES_HEAD_ID} />
          </div>
          {content.noForgeLine === null ? null : <p className="gaia-rail-no-forge">{content.noForgeLine}</p>}
          {content.forges.map((row) => (
            <a
              key={row.trackerId}
              className="gaia-rail-row"
              href={row.href}
              aria-current={row.isCurrent ? 'page' : undefined}
              title={row.title}
              data-setup={row.setupLine === null ? undefined : ''}
            >
              <ConditionDot condition={row.condition} />
              <RailForgeName row={row} />
              {row.offersSetUp ? <span className="gaia-rail-count"><Tag text={SET_UP_LABEL} tone="warn" dashed /></span> : <RailCountBadge count={row.count} />}
            </a>
          ))}
        </div>
      )}
      <div className="gaia-rail-spacer" />
      {content.machine === null ? null : <RailMachineLink machine={content.machine} />}
    </nav>
  );
}
