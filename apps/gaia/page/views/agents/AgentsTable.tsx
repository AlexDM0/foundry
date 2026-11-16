/**
 * The Agents table (SCREENS A2): a head row, then one group per forge, its head row first (the forge's condition, its agents against its
 * limit, its brain's pill, Wake, starting note or refusal, and what of it waits on User), then a row per agent, and last its running brain's
 * row with its Stop. A row selects itself through a link stretched over it; its job's own link and the brain's Stop sit above that one.
 */
import { Button }         from 'design-system/Button';
import { FillMeter }      from 'design-system/FillMeter';
import { MonoId }         from 'design-system/MonoId';
import { SlotMeter }      from 'design-system/SlotMeter';
import type { StateTone } from 'design-system/StateTone';
import { Tag }            from 'design-system/Tag';

import type { ForgeCommandBody } from '../../@types/CommandDocument.ts';
import type { CommandSubject }   from '../../api/CommandSender.ts';
import { BrainChip }             from '../../design-system/BrainChip.tsx';
import { ConditionDot }          from '../../design-system/ConditionDot.tsx';
import { Refusal }               from '../../design-system/Refusal.tsx';
import { RoleDot }               from '../../design-system/RoleDot.tsx';
import type {
  AgentCalls,
  AgentGroupContent,
  AgentMeterTone,
  AgentRowContent
} from './AgentsModel.ts';
import type { BrainCommandButton, BrainRowContent, GroupBrainContent } from './BrainModel.ts';

/** What the brain's controls hand the view: the command to send its forge, and the dismissal of a refused one. */
export interface BrainHandlers {
  readonly onBrainCommand:   (command: ForgeCommandBody) => void;
  readonly onDismissFailure: (subject: CommandSubject) => void;
}

export const BRAIN_NAME = 'Flint\'s brain';

const WAKE_LABEL = 'Wake Flint\'s brain';

const BRAIN_ROLE = 'brain';

const COLUMN_LABELS = ['Job', 'Ticket · last tool', 'State', 'Calls', 'Tokens'] as const;

/** A calls meter's fill by the agent's role, in the package's tones: orange builds or asks User, teal reviews, grey for the rest. */
const METER_STATE_TONES: Readonly<Record<AgentMeterTone, StateTone>> = {
  neutral:  'neutral',
  builder:  'accent',
  reviewer: 'info',
  asks:     'accent',
  paused:   'neutral',
};

/** The role word takes its role's ink: orange for a builder and the brain, teal for a reviewer, the muted ink for any other. */
type RoleInk = 'builder' | 'reviewer' | 'brain' | 'other';

/** What a cell shows for a value the forge did not report. */
const NOT_REPORTED = '—';

function NotReported() {
  return <span className="gaia-agents-not-reported">{NOT_REPORTED}</span>;
}

function roleInkOf(role: string | null): RoleInk {
  return role === 'builder' || role === 'reviewer' || role === BRAIN_ROLE ? role : 'other';
}

export function AgentCallsMeter({ calls }: { readonly calls: AgentCalls }) {
  const { meter, text } = calls;
  return (
    <span className="gaia-agents-calls">
      {meter === null ? null : (
        <span className="gaia-agents-calls-meter">
          <FillMeter label={meter.label} used={meter.used} limit={meter.whole} near={meter.used >= meter.whole} tone={METER_STATE_TONES[meter.tone]} />
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

/** Stop on the brain's row and panel: its forge's brain only, named for that forge, with no confirmation (PLAN Q16). */
export function BrainStopButton({
  stop, project, onBrainCommand, place
}: { readonly stop: BrainCommandButton; readonly project: string; readonly onBrainCommand: BrainHandlers['onBrainCommand']; readonly place: 'row' | 'panel' }) {
  const sizeProps = place === 'row' ? { dense: true } : { compact: true };
  return (
    <Button label="Stop" accessibleName={`Stop ${BRAIN_NAME} on ${project}`} {...sizeProps} disabled={stop.disabled} onPress={() => onBrainCommand(stop.command)} />
  );
}

function WakeButton({ wake, project, onBrainCommand }: { readonly wake: BrainCommandButton; readonly project: string; readonly onBrainCommand: BrainHandlers['onBrainCommand'] }) {
  return (
    <Button
      label={WAKE_LABEL}
      accessibleName={`${WAKE_LABEL} on ${project}`}
      leading={<RoleDot role="brain" />}
      emphasis="ghost"
      dense
      disabled={wake.disabled}
      onPress={() => onBrainCommand(wake.command)}
    />
  );
}

/** The brain's part of its forge's head: as B1's bar draws the starting note and the refusal; a running brain is a pill, not the chip. */
function GroupBrain({ brain, project, onBrainCommand }: { readonly brain: GroupBrainContent; readonly project: string; readonly onBrainCommand: BrainHandlers['onBrainCommand'] }) {
  switch (brain.kind) {
    case 'none':
      return null;
    case 'off':
      return <WakeButton wake={brain.wake} project={project} onBrainCommand={onBrainCommand} />;
    case 'starting':
      return <BrainChip state="starting" />;
    case 'running':
      return (
        <span className="gaia-agents-group-brain-pill">
          <RoleDot role="brain" />
          + brain
        </span>
      );
    case 'refused': {
      const { wake } = brain;
      return (
        <BrainChip
          state="refused"
          refusedBy={brain.refusedBy}
          sentence={brain.sentence}
          code={brain.code}
          wake={wake === null ? null : { disabled: wake.disabled, onPress: () => onBrainCommand(wake.command) }}
        />
      );
    }
  }
}

function GroupHead({ group, handlers }: { readonly group: AgentGroupContent; readonly handlers: BrainHandlers }) {
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
        <GroupBrain brain={group.brain} project={group.project} onBrainCommand={handlers.onBrainCommand} />
        {group.noteText === null ? null : <span className="gaia-agents-group-note">{group.noteText}</span>}
      </span>
    </div>
  );
}

/** Gaia's answer to the forge's last brain command, under its forge's head until dismissed or until the next command to it succeeds. */
function GroupBrainRefusal({ group, handlers }: { readonly group: AgentGroupContent; readonly handlers: BrainHandlers }) {
  const refusal = group.brainRefusal;
  if (refusal === null) return null;
  return (
    <div className="gaia-agents-group-refusal" role="row">
      <span className="gaia-agents-group-refusal-cell" role="cell" aria-colspan={COLUMN_LABELS.length}>
        <Refusal
          commandLabel={refusal.commandLabel}
          refusedBy={refusal.refusedBy}
          code={refusal.code}
          sentence={refusal.sentence}
          onDismiss={() => handlers.onDismissFailure({ trackerId: group.trackerId })}
        />
      </span>
    </div>
  );
}

/** Not a job: the brain's name is no link, it has no ticket, budget or meter, and its time left is the forge's `endsAt` counted down. */
function BrainRow({ row, onBrainCommand }: { readonly row: BrainRowContent; readonly onBrainCommand: BrainHandlers['onBrainCommand'] }) {
  return (
    <div className="gaia-agents-row" role="row" data-brain="" data-selected={row.isSelected ? '' : undefined} aria-current={row.isSelected ? 'true' : undefined}>
      <span className="gaia-agents-cell" role="cell">
        <span className="gaia-agents-job-cell">
          <a className="gaia-agents-select" href={row.selectHref} aria-label={`${row.project}, ${BRAIN_NAME}`} />
          <RoleDot role="brain" />
          <span className="gaia-agents-job-lines">
            <span className="gaia-agents-brain-name">{BRAIN_NAME}</span>
            <span className="gaia-agents-job-line">
              <RoleWord role={BRAIN_ROLE} />
              {row.runTimeText === null ? <NotReported /> : <span className="gaia-agents-running">{row.runTimeText}</span>}
            </span>
          </span>
        </span>
      </span>
      <span className="gaia-agents-cell" role="cell">
        <span className="gaia-agents-brain-ticket-cell">
          <span className="gaia-agents-ticket-cell">
            <span className="gaia-agents-brain-outside">outside the limit</span>
            {row.newestMoveText === null ? <NotReported /> : <span className="gaia-agents-last-tool-call">{row.newestMoveText}</span>}
          </span>
          {row.stop === null ? null : (
            <span className="gaia-agents-brain-stop">
              <BrainStopButton stop={row.stop} project={row.project} onBrainCommand={onBrainCommand} place="row" />
            </span>
          )}
        </span>
      </span>
      <span className="gaia-agents-cell" role="cell">
        <span className="gaia-agents-state">
          Running
          {row.timeLeftText === null ? null : <span className="gaia-agents-brain-time-left">{`${row.timeLeftText} left`}</span>}
        </span>
      </span>
      <span className="gaia-agents-cell" role="cell">
        <span className="gaia-agents-brain-calls">
          {row.model === null ? <NotReported /> : (
            <span>
              <span className="gaia-agents-brain-model">{row.model}</span>
              {row.effort === null ? null : <span className="gaia-agents-brain-effort">{` · ${row.effort}`}</span>}
            </span>
          )}
          {row.calls === null ? null : <span className="gaia-agents-brain-calls-text">{row.calls === 1 ? '1 call' : `${row.calls} calls`}</span>}
        </span>
      </span>
      <span className="gaia-agents-cell" role="cell" data-align="end"><span className="gaia-agents-tokens">{row.tokensText}</span></span>
    </div>
  );
}

export function AgentsTable({ groups, handlers }: { readonly groups: readonly AgentGroupContent[]; readonly handlers: BrainHandlers }) {
  return (
    <div className="gaia-agents-table" role="table" aria-label="Agents">
      <div className="gaia-agents-row" role="row" data-head="">
        {COLUMN_LABELS.map((label, i) => (
          <span key={label} className="gaia-agents-cell" role="columnheader" data-align={i === COLUMN_LABELS.length - 1 ? 'end' : undefined}>{label}</span>
        ))}
      </div>
      {groups.map((group) => (
        <div key={group.trackerId} className="gaia-agents-group" role="rowgroup" aria-label={group.project}>
          <GroupHead group={group} handlers={handlers} />
          <GroupBrainRefusal group={group} handlers={handlers} />
          {group.rows.map((row) => <AgentRow key={row.key} row={row} />)}
          {group.brainRow === null ? null : <BrainRow row={group.brainRow} onBrainCommand={handlers.onBrainCommand} />}
        </div>
      ))}
    </div>
  );
}
