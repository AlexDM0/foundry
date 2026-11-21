/**
 * The Agents table (SCREENS A2): a head row, then one group per forge, its head row first (the forge's condition, its agents against its
 * limit, and what of it waits on User), then a row per agent. A row selects itself through a link stretched over it; its job's own link sits
 * above that one.
 */
import { FillMeter }      from 'design-system/FillMeter';
import { MonoId }         from 'design-system/MonoId';
import { SlotMeter }      from 'design-system/SlotMeter';
import type { StateTone } from 'design-system/StateTone';
import { Tag }            from 'design-system/Tag';

import { ConditionDot } from '../../design-system/ConditionDot.tsx';
import { RoleDot }      from '../../design-system/RoleDot.tsx';
import type {
  AgentCalls,
  AgentGroupContent,
  AgentMeterTone,
  AgentRowContent
} from './AgentsModel.ts';

const COLUMN_LABELS = ['Job', 'Ticket · last tool', 'State', 'Calls', 'Tokens'] as const;

/** A calls meter's fill by the agent's role, in the package's tones: orange builds or asks User, teal reviews, grey for the rest. */
const METER_STATE_TONES: Readonly<Record<AgentMeterTone, StateTone>> = {
  neutral:  'neutral',
  builder:  'accent',
  reviewer: 'info',
  asks:     'accent',
  paused:   'neutral',
};

/** The role word takes its role's ink: orange for a builder, teal for a reviewer, the muted ink for any other. */
type RoleInk = 'builder' | 'reviewer' | 'other';

/** What a cell shows for a value the forge did not report. */
const NOT_REPORTED = '—';

function NotReported() {
  return <span className="gaia-agents-not-reported">{NOT_REPORTED}</span>;
}

function roleInkOf(role: string | null): RoleInk {
  return role === 'builder' || role === 'reviewer' ? role : 'other';
}

export function AgentCallsMeter({ calls }: { readonly calls: AgentCalls }) {
  const { meter, text } = calls;
  return (
    <span className="gaia-agents-calls">
      {meter === null ? null : (
        <span className="gaia-agents-calls-meter">
          <FillMeter label={meter.label} used={meter.used} limit={meter.whole} near={meter.used >= meter.whole} tone={METER_STATE_TONES[meter.tone]} borderless />
        </span>
      )}
      <span className="gaia-agents-calls-text">{text}</span>
    </span>
  );
}

export function RoleWord({ role }: { readonly role: string | null }) {
  if (role === null) return <NotReported />;
  return <span className="gaia-agents-role" data-role={roleInkOf(role)}>{role}</span>;
}

function JobCell({ row }: { readonly row: AgentRowContent }) {
  return (
    <span className="gaia-agents-job-cell">
      <a className="gaia-agents-select" href={row.selectHref} aria-label={row.selectLabel} />
      {row.dotRole === null ? <span className="gaia-agents-no-dot" /> : <RoleDot role={row.dotRole} />}
      <span className="gaia-agents-job-lines">
        <a className="gaia-agents-job" href={row.jobHref}>{row.jobId}</a>
        <span className="gaia-agents-job-line">
          <RoleWord role={row.role} />
          {row.runningText === null ? <NotReported /> : <span className="gaia-agents-running">{row.runningText}</span>}
        </span>
      </span>
    </span>
  );
}

function TicketCell({ row }: { readonly row: AgentRowContent }) {
  const hasTicket = row.ticketIdsText !== null || row.ticketTitle !== null;
  return (
    <span className="gaia-agents-ticket-cell">
      {hasTicket ? (
        <span className="gaia-agents-ticket">
          {row.ticketIdsText === null ? null : <MonoId text={row.ticketIdsText} />}
          {row.ticketIdsText !== null && row.ticketTitle !== null ? ' ' : null}
          {row.ticketTitle}
        </span>
      ) : <NotReported />}
      {row.lastToolCall === null ? <NotReported /> : <span className="gaia-agents-last-tool-call">{row.lastToolCall}</span>}
    </span>
  );
}

function StateCell({ row }: { readonly row: AgentRowContent }) {
  return (
    <span className="gaia-agents-state">
      {row.stateText}
      {row.flags.map((flag) => <Tag key={flag.text} text={flag.text} tone={flag.tone} />)}
    </span>
  );
}

function AgentRow({ row }: { readonly row: AgentRowContent }) {
  return (
    <div className="gaia-agents-row" role="row" data-selected={row.isSelected ? '' : undefined} aria-current={row.isSelected ? 'true' : undefined}>
      <span className="gaia-agents-cell" role="cell"><JobCell row={row} /></span>
      <span className="gaia-agents-cell" role="cell"><TicketCell row={row} /></span>
      <span className="gaia-agents-cell" role="cell"><StateCell row={row} /></span>
      <span className="gaia-agents-cell" role="cell">{row.calls === null ? <NotReported /> : <AgentCallsMeter calls={row.calls} />}</span>
      <span className="gaia-agents-cell" role="cell" data-align="end"><span className="gaia-agents-tokens">{row.tokensText}</span></span>
    </div>
  );
}

function GroupHead({ group }: { readonly group: AgentGroupContent }) {
  return (
    <div className="gaia-agents-group-head" role="row">
      <span className="gaia-agents-group-head-cell" role="rowheader" aria-colspan={COLUMN_LABELS.length}>
        {group.condition === null ? null : <ConditionDot condition={group.condition} />}
        <span className="gaia-agents-group-name">{group.project}</span>
        <span className="gaia-agents-group-agents">
          {group.slots === null ? null : <SlotMeter label={group.slots.label} filled={group.slots.filled} limit={group.slots.limit} tone="accent" />}
          <span className="gaia-agents-group-figure">{group.agentsFigure}</span>
          <span className="gaia-agents-group-word">{group.agentsWord}</span>
        </span>
        {group.noteText === null ? null : <span className="gaia-agents-group-note">{group.noteText}</span>}
      </span>
    </div>
  );
}

export function AgentsTable({ groups }: { readonly groups: readonly AgentGroupContent[] }) {
  return (
    <div className="gaia-agents-table" role="table" aria-label="Agents">
      <div className="gaia-agents-row" role="row" data-head="">
        {COLUMN_LABELS.map((label, i) => (
          <span key={label} className="gaia-agents-cell" role="columnheader" data-align={i === COLUMN_LABELS.length - 1 ? 'end' : undefined}>{label}</span>
        ))}
      </div>
      {groups.map((group) => (
        <div key={group.trackerId} className="gaia-agents-group" role="rowgroup" aria-label={group.project}>
          <GroupHead group={group} />
          {group.rows.map((row) => <AgentRow key={row.key} row={row} />)}
        </div>
      ))}
    </div>
  );
}
