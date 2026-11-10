/**
 * The table both cards of the Agents tab share: a fixed set of columns (four more with diagnostics), a project row whose line each card
 * fills, then each job's row and, under a job that asks User, its strip. A card with no job keeps its project row over its empty line.
 */
import type { ReactNode } from 'react';

import type { IdentifiedRecord }                            from '../../@types/BoardStateDocument.ts';
import { EmptyState }                                       from '../../design-system/ListSection.tsx';
import type { AgentJobDocument }                            from './AgentJobDocument.ts';
import { AgentsModel, type AgentsGroup, type ProjectGroup } from './AgentsModel.ts';
import { JobRow }                                           from './JobRow.tsx';

const COLUMNS = ['job', 'subject', 'state', 'calls', 'subagents', 'last-tool', 'tokens'] as const;

const DIAGNOSTICS_COLUMNS = ['phase', 'tool-calls', 'silent-sweeps', 'watcher'] as const;

type Column = typeof COLUMNS[number] | typeof DIAGNOSTICS_COLUMNS[number];

const HEAD_TEXT: Readonly<Record<Column, string>> = {
  'job':           'Job',
  'subject':       'Ticket',
  'state':         'State',
  'calls':         'Calls against budget',
  'subagents':     'Subagents',
  'last-tool':     'Last tool',
  'tokens':        'Tokens so far',
  'phase':         'Phase',
  'tool-calls':    'Tool calls',
  'silent-sweeps': 'Silent sweeps',
  'watcher':       'Watcher',
};

/** Sessions name what a session is about rather than a ticket, and have no call budget. */
const SESSION_HEAD_TEXT: Partial<Readonly<Record<Column, string>>> = { subject: 'About', calls: 'Calls' };

export interface JobTableProps {
  readonly variant:         AgentsGroup;
  readonly project:         string;
  /** What the project row shows after the project's name. */
  readonly projectLine:     ReactNode;
  readonly groups:          readonly ProjectGroup[];
  readonly decisions:       readonly IdentifiedRecord[];
  readonly emptyText:       string;
  readonly subjectOf:       (job: AgentJobDocument) => ReactNode;
  readonly countedOf:       (jobId: string) => boolean | null;
  readonly selectedJobId:   string | null;
  readonly now:             Date;
  readonly showDiagnostics: boolean;
}

function headTextOf(column: Column, variant: AgentsGroup): string {
  return (variant === 'sessions' ? SESSION_HEAD_TEXT[column] : undefined) ?? HEAD_TEXT[column];
}

function ProjectRow({ project, line, columnCount }: { readonly project: string; readonly line: ReactNode; readonly columnCount: number }) {
  return (
    <tr className="agents-project-row">
      <td colSpan={columnCount}>
        <div className="agents-project-line">
          <span className="agents-project-name">{project}</span>
          {line}
        </div>
      </td>
    </tr>
  );
}

export function JobTable({
  variant, project, projectLine, groups, decisions, emptyText, subjectOf, countedOf, selectedJobId, now, showDiagnostics
}: JobTableProps) {
  const columns: readonly Column[] = showDiagnostics ? [...COLUMNS, ...DIAGNOSTICS_COLUMNS] : COLUMNS;
  const hasJobs = groups.some((group) => group.jobs.length > 0);
  return (
    <div className="agents-scroll">
      <table className="agents-table" data-diagnostics={showDiagnostics ? '' : undefined}>
        <colgroup>
          {columns.map((column) => <col key={column} data-column={column} />)}
        </colgroup>
        {hasJobs
          ? (
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column} data-column={column}>
                    {headTextOf(column, variant)}
                    {column === 'subagents' ? <span className="agents-head-note">not counted</span> : null}
                  </th>
                ))}
              </tr>
            </thead>
          )
          : null}
        <tbody>
          {hasJobs
            ? groups.map((group) => (
              <ProjectGroupRows
                key={group.project}
                group={group}
                line={projectLine}
                columnCount={columns.length}
                decisions={decisions}
                subjectOf={subjectOf}
                countedOf={countedOf}
                selectedJobId={selectedJobId}
                now={now}
                showDiagnostics={showDiagnostics}
              />
            ))
            : (
              <>
                <ProjectRow project={project} line={projectLine} columnCount={columns.length} />
                <tr className="agents-empty-row">
                  <td colSpan={columns.length}><EmptyState text={emptyText} /></td>
                </tr>
              </>
            )}
        </tbody>
      </table>
    </div>
  );
}

interface ProjectGroupRowsProps {
  readonly group:           ProjectGroup;
  readonly line:            ReactNode;
  readonly columnCount:     number;
  readonly decisions:       readonly IdentifiedRecord[];
  readonly subjectOf:       (job: AgentJobDocument) => ReactNode;
  readonly countedOf:       (jobId: string) => boolean | null;
  readonly selectedJobId:   string | null;
  readonly now:             Date;
  readonly showDiagnostics: boolean;
}

function ProjectGroupRows({
  group, line, columnCount, decisions, subjectOf, countedOf, selectedJobId, now, showDiagnostics
}: ProjectGroupRowsProps) {
  return (
    <>
      <ProjectRow project={group.project} line={line} columnCount={columnCount} />
      {group.jobs.map((job) => (
        <JobRow
          key={job.id}
          job={job}
          ask={AgentsModel.askOf(decisions, job.id)}
          counted={countedOf(job.id)}
          subject={subjectOf(job)}
          selected={job.id === selectedJobId}
          now={now}
          showDiagnostics={showDiagnostics}
          columnCount={columnCount}
        />
      ))}
    </>
  );
}
