/**
 * The Agents view (SCREENS A2): every running agent on the machine in one table, the two filters over it, and the selected agent's panel.
 * It takes no hooks: the shell hands it the content and the way to change the filters, which it writes into the route.
 */
import { DataTable, type DataTableColumn, type DataTableRow }       from '../../design-system/DataTable.tsx';
import { Meter }                                                    from '../../design-system/Meter.tsx';
import { MicroCapsLabel }                                           from '../../design-system/MicroCapsLabel.tsx';
import { RoleDot }                                                  from '../../design-system/RoleDot.tsx';
import { SegmentedControl }                                         from '../../design-system/SegmentedControl.tsx';
import { Tag }                                                      from '../../design-system/Tag.tsx';
import type { RailMachine }                                         from '../../shell/RailModel.ts';
import type { AgentConditionFilter, AgentFilters, AgentRoleFilter } from './AgentsFilters.ts';
import type { AgentRowContent, AgentsContent }                      from './AgentsModel.ts';
import { SelectedAgentPanel }                                       from './SelectedAgentPanel.tsx';

export interface AgentsViewProps {
  readonly content:         AgentsContent;
  readonly onFiltersChange: (filters: AgentFilters) => void;
}

type AgentColumn = 'forge' | 'job' | 'role' | 'ticket' | 'state' | 'running' | 'calls' | 'tokens' | 'lastToolCall';

const AGENT_COLUMNS: readonly DataTableColumn<AgentColumn>[] = [
  { key: 'forge', label: 'Forge' },
  { key: 'job', label: 'Job' },
  { key: 'role', label: 'Role' },
  { key: 'ticket', label: 'Ticket' },
  { key: 'state', label: 'State' },
  { key: 'running', label: 'Running', align: 'end' },
  { key: 'calls', label: 'Calls' },
  { key: 'tokens', label: 'Tokens', align: 'end' },
  { key: 'lastToolCall', label: 'Last tool call' },
];

/** The tracks live in tokens.css with every other size. */
const AGENT_COLUMN_WIDTHS = 'var(--agents-table-columns)';

/** What a cell shows for a value the forge did not report. */
const NOT_REPORTED = '—';

function NotReported() {
  return <span className="gaia-agents-not-reported">{NOT_REPORTED}</span>;
}

function TicketCell({ row }: { readonly row: AgentRowContent }) {
  if (row.ticketIdsText === null && row.ticketTitle === null) return <NotReported />;
  return (
    <span className="gaia-agents-ticket">
      {row.ticketIdsText === null ? null : <span className="gaia-agents-ticket-ids">{row.ticketIdsText}</span>}
      {row.ticketIdsText !== null && row.ticketTitle !== null ? ' ' : null}
      {row.ticketTitle}
    </span>
  );
}

function StateCell({ row }: { readonly row: AgentRowContent }) {
  return (
    <span className="gaia-agents-state">
      {row.dotRole === null ? null : <RoleDot role={row.dotRole} />}
      {row.stateText}
      {row.flags.map((flag) => <Tag key={flag.text} text={flag.text} tone={flag.tone} />)}
    </span>
  );
}

function CallsCell({ row }: { readonly row: AgentRowContent }) {
  if (row.calls === null) return <NotReported />;
  const { meter, text } = row.calls;
  return (
    <span className="gaia-agents-calls">
      {meter === null ? null : (
        <span className="gaia-agents-calls-meter">
          <Meter label={meter.label} used={meter.used} whole={meter.whole} tone={meter.tone} />
        </span>
      )}
      <span className="gaia-agents-calls-text">{text}</span>
    </span>
  );
}

function MachineValue({ text, tone = 'ink' }: { readonly text: string | null; readonly tone?: 'ink' | 'muted' }) {
  if (text === null) return <NotReported />;
  return <span className="gaia-agents-machine-value" data-tone={tone}>{text}</span>;
}

function tableRowOf(row: AgentRowContent): DataTableRow<AgentColumn> {
  return {
    key:      row.key,
    selected: row.isSelected,
    cells:    {
      forge:        <a className="gaia-agents-select" href={row.selectHref} aria-label={row.selectLabel}>{row.project}</a>,
      job:          <a className="gaia-agents-job" href={row.jobHref}>{row.jobId}</a>,
      role:         row.role === null ? <NotReported /> : <span className="gaia-agents-role">{row.role}</span>,
      ticket:       <TicketCell row={row} />,
      state:        <StateCell row={row} />,
      running:      <MachineValue text={row.runningText} tone="muted" />,
      calls:        <CallsCell row={row} />,
      tokens:       <MachineValue text={row.tokensText} />,
      lastToolCall: row.lastToolCall === null ? <NotReported /> : <span className="gaia-agents-last-tool-call">{row.lastToolCall}</span>,
    },
  };
}

function NoAgentRuns({ machine }: { readonly machine: RailMachine }) {
  return (
    <section className="gaia-agents-empty" aria-label="No agents">
      <p className="gaia-agents-empty-sentence">No agents are running.</p>
      <div className="gaia-agents-machine" data-at-the-limit={machine.isAtTheLimit ? '' : undefined}>
        <MicroCapsLabel text="This machine" element="div" />
        <span className="gaia-agents-machine-agents">
          <span className="gaia-agents-machine-figure">{machine.agentsText}</span>
          <span className="gaia-agents-machine-unit">agents</span>
        </span>
        {machine.meter === null ? null : <Meter label={machine.meter.label} used={machine.meter.used} whole={machine.meter.whole} thickness="thick" />}
        <span className="gaia-agents-machine-line">{machine.limitLine}</span>
      </div>
    </section>
  );
}

function AgentFilterBar({ content, onFiltersChange }: AgentsViewProps) {
  const { filters } = content;
  return (
    <div className="gaia-agents-filters">
      <SegmentedControl<AgentRoleFilter> label="Role" options={content.roleOptions} selected={filters.role} onSelect={(role) => onFiltersChange({ ...filters, role })} />
      <SegmentedControl<AgentConditionFilter>
        label="Condition"
        options={content.conditionOptions}
        selected={filters.condition}
        onSelect={(condition) => onFiltersChange({ ...filters, condition })}
      />
      <span className="gaia-agents-order">Sorted by forge, then job</span>
    </div>
  );
}

export function AgentsView({ content, onFiltersChange }: AgentsViewProps) {
  if (content.agentCount === 0) {
    return (
      <div className="gaia-agents">
        <NoAgentRuns machine={content.machine} />
        {content.selected.kind === 'none-selected' ? null : <SelectedAgentPanel content={content.selected} />}
      </div>
    );
  }
  return (
    <div className="gaia-agents">
      <AgentFilterBar content={content} onFiltersChange={onFiltersChange} />
      {content.rows.length === 0
        ? <p className="gaia-agents-no-match">No agent matches these filters.</p>
        : <DataTable label="Agents" columns={AGENT_COLUMNS} columnWidths={AGENT_COLUMN_WIDTHS} rows={content.rows.map(tableRowOf)} />}
      <SelectedAgentPanel content={content.selected} />
    </div>
  );
}
