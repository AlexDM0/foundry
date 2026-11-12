/**
 * The 232 px rail on every screen: the brand, the four views with their counts, one row per forge, and this machine. Every row is a link
 * to its route; the current one carries `aria-current`.
 */
import { ConditionDot }                             from '../design-system/ConditionDot.tsx';
import { GaiaMark }                                 from '../design-system/GaiaMark.tsx';
import { Meter }                                    from '../design-system/Meter.tsx';
import { MicroCapsLabel }                           from '../design-system/MicroCapsLabel.tsx';
import type { RailContent, RailCount, RailMachine } from './RailModel.ts';

const MACHINE_HREF = '#forges';
const FORGES_HEAD_ID = 'gaia-rail-forges-head';

function RailCountText({ count }: { readonly count: RailCount | null }) {
  if (count === null) return null;
  return <span className="gaia-rail-count" data-tone={count.tone}>{count.text}</span>;
}

function RailMachineLink({ machine }: { readonly machine: RailMachine }) {
  return (
    <a className="gaia-rail-machine" href={MACHINE_HREF} data-at-the-limit={machine.isAtTheLimit ? '' : undefined}>
      <MicroCapsLabel text="This machine" />
      <span className="gaia-rail-machine-agents">
        <span className="gaia-rail-machine-figure">{machine.agentsText}</span>
        <span className="gaia-rail-machine-unit">agents</span>
      </span>
      {machine.meter === null ? null : <Meter label={machine.meter.label} used={machine.meter.used} whole={machine.meter.whole} />}
      <span className="gaia-rail-machine-line">{machine.limitLine}</span>
    </a>
  );
}

export function Rail({ content }: { readonly content: RailContent }) {
  return (
    <nav className="gaia-rail" aria-label="Gaia">
      <div className="gaia-rail-brand">
        <GaiaMark />
        <span className="gaia-rail-brand-name">Gaia</span>
      </div>
      <div className="gaia-rail-group">
        {content.views.map((row) => (
          <a key={row.view} className="gaia-rail-row" href={row.href} aria-current={row.isCurrent ? 'page' : undefined}>
            <span className="gaia-rail-row-label">{row.label}</span>
            <RailCountText count={row.count} />
          </a>
        ))}
      </div>
      {content.forges.length === 0 ? null : (
        <div className="gaia-rail-group" role="group" aria-labelledby={FORGES_HEAD_ID}>
          <div className="gaia-rail-group-head">
            <MicroCapsLabel text="Forges" id={FORGES_HEAD_ID} />
          </div>
          {content.forges.map((row) => (
            <a key={row.trackerId} className="gaia-rail-row" href={row.href} aria-current={row.isCurrent ? 'page' : undefined}>
              <ConditionDot condition={row.condition} />
              <span className="gaia-rail-row-label">{row.project}</span>
              <RailCountText count={row.count} />
            </a>
          ))}
        </div>
      )}
      <div className="gaia-rail-spacer" />
      {content.machine === null ? null : <RailMachineLink machine={content.machine} />}
    </nav>
  );
}
