/**
 * The 232 px rail under the brand bar: the four views with their counts, one row per forge or the line saying there is none, and this
 * machine with its slot meter. Every row is a link to its route; the current one carries `aria-current`.
 */
import { CountBadge }     from 'design-system/CountBadge';
import { MicroCapsLabel } from 'design-system/MicroCapsLabel';
import { SlotMeter }      from 'design-system/SlotMeter';

import { ConditionDot }                               from '../design-system/ConditionDot.tsx';
import type { MachineLoad }                           from '../shared/MachineLoadModel.ts';
import type { RailContent, RailCount, RailCountMark } from './RailModel.ts';

const MACHINE_HREF = '#forges';
const FORGES_HEAD_ID = 'gaia-rail-forges-head';

/** What a count's mark says, as its tooltip: the package's badge holds a number only, so the mark follows it. */
const MARK_TITLES: Readonly<Record<Exclude<RailCountMark, ''>, string>> = {
  '+': 'more possible',
  '?': 'as last reported',
};

function RailCountBadge({ count }: { readonly count: RailCount | null }) {
  if (count === null) return null;
  return (
    <span className="gaia-rail-count">
      <CountBadge count={count.count} tone={count.tone === 'attention' ? 'warn' : 'neutral'} />
      {count.mark === '' ? null : <span className="gaia-rail-count-mark" title={MARK_TITLES[count.mark]}>{count.mark}</span>}
    </span>
  );
}

function RailMachineLink({ machine }: { readonly machine: MachineLoad }) {
  return (
    <a className="gaia-rail-machine" href={MACHINE_HREF} data-at-the-limit={machine.isAtTheLimit ? '' : undefined}>
      <MicroCapsLabel text="This machine" />
      <span className="gaia-rail-machine-agents">
        <span className="gaia-rail-machine-figure">{machine.agentsText}</span>
        <span className="gaia-rail-machine-unit">agents</span>
      </span>
      <SlotMeter label={machine.meter.label} filled={machine.meter.filled} limit={machine.meter.slots} tone="accent" />
      {machine.atTheLimitLine === null ? null : <span className="gaia-rail-machine-at-the-limit">{machine.atTheLimitLine}</span>}
      <span className="gaia-rail-machine-line">{machine.limitLine}</span>
    </a>
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
            <a key={row.trackerId} className="gaia-rail-row" href={row.href} aria-current={row.isCurrent ? 'page' : undefined} title={row.title}>
              <ConditionDot condition={row.condition} />
              <span className="gaia-rail-row-label">{row.project}</span>
              <RailCountBadge count={row.count} />
            </a>
          ))}
        </div>
      )}
      <div className="gaia-rail-spacer" />
      {content.machine === null ? null : <RailMachineLink machine={content.machine} />}
    </nav>
  );
}
