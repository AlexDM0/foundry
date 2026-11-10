/**
 * One job's row: its role glyph, id and role word; what it works on; its state with a quiet, watch-only or not-counted tag; its calls
 * against its budget as a meter; its subagents as squares; its last tool call; its tokens. Diagnostics add its phase, tool calls, silent
 * sweeps and Watcher. A job that asks User is marked and followed by its Asks User strip.
 */
import type { ReactNode } from 'react';

import type { DisplayState }        from '../../../src/lib/tracker-model/@types/Task.ts';
import { FillMeter }                from '../../design-system/Meter.tsx';
import { StateBadge }               from '../../design-system/StateBadge.tsx';
import { Tag }                      from '../../design-system/Tag.tsx';
import { HashRouter }               from '../../shell/HashRouter.ts';
import { JobStateUtil }             from '../../utils/JobStateUtil.ts';
import type { AgentJobDocument }    from './AgentJobDocument.ts';
import { AgentsModel, type JobAsk } from './AgentsModel.ts';
import { ASKING_STATE, AskUserRow } from './AskUserRow.tsx';
import { LastToolCallCell }         from './LastToolCallCell.tsx';
import { RoleGlyph }                from './RoleGlyph.tsx';
import { SubagentSquares }          from './SubagentSquares.tsx';

export interface JobRowProps {
  readonly job:             AgentJobDocument;
  readonly ask:             JobAsk | null;
  /** Whether the job holds a launch slot; `null` where that is not shown (a session, or a board serving no launch slots). */
  readonly counted:         boolean | null;
  /** The cell of what the job works on: its tickets, or what a session is about. */
  readonly subject:         ReactNode;
  readonly selected:        boolean;
  readonly now:             Date;
  readonly showDiagnostics: boolean;
  readonly columnCount:     number;
}

function BudgetCell({ job, laneState }: { readonly job: AgentJobDocument; readonly laneState: DisplayState }) {
  const meter = AgentsModel.budgetMeterOf(job);
  return (
    <div className="agents-budget">
      <FillMeter label={meter.label} used={meter.used} limit={meter.limit} near={meter.near} state={laneState} />
      <span className="agents-budget-figure" data-near={meter.near ? '' : undefined}>
        {meter.limit === null
          ? (
            <>
              {meter.used}
              <span className="agents-muted"> · none</span>
            </>
          )
          : `${meter.used} / ${meter.limit}`}
      </span>
    </div>
  );
}

export function JobRow({
  job, ask, counted, subject, selected, now, showDiagnostics, columnCount
}: JobRowProps) {
  const { live } = job;
  const roleMark = AgentsModel.roleMarkOf(job);
  const quietText = AgentsModel.quietTextOf(live.silentSweeps);
  return (
    <>
      <tr
        className="agents-job-row"
        aria-selected={selected}
        data-job-id={job.id}
        data-asking={ask === null ? undefined : ''}
        data-state={ask === null ? undefined : ASKING_STATE}
      >
        <td data-column="job">
          <div className="agents-job-cell">
            <RoleGlyph mark={roleMark} />
            <a className="agents-job-link" href={HashRouter.fragmentOf({ tab: 'agents', item: job.id })}>{job.id}</a>
            <span className="agents-muted">{roleMark.word}</span>
          </div>
        </td>
        <td data-column="subject">{subject}</td>
        <td data-column="state">
          <div className="agents-state-cell">
            <StateBadge state={JobStateUtil.paletteStateOf(job.state)} label={job.state} />
            {quietText === null ? null : <Tag text={quietText} tone="warn" />}
            {live.watchOnly ? <Tag text="watch only" tone="warn" /> : null}
            {counted === false ? <Tag text="not counted" tone="neutral" dashed /> : null}
          </div>
        </td>
        <td data-column="calls"><BudgetCell job={job} laneState={roleMark.state} /></td>
        <td data-column="subagents"><SubagentSquares {...AgentsModel.subagentSquaresOf(job)} state={roleMark.state} /></td>
        <td data-column="last-tool"><LastToolCallCell lastToolCall={live.lastToolCall} silentSweeps={live.silentSweeps} now={now} /></td>
        <td data-column="tokens">{live.tokens.toLocaleString('en-US')}</td>
        {showDiagnostics
          ? (
            <>
              <td data-column="phase">{job.airlock?.phase ?? '-'}</td>
              <td data-column="tool-calls">{`${live.toolCalls} (${live.toolCallsWithSubagents} with subagents)`}</td>
              <td data-column="silent-sweeps">{live.silentSweeps}</td>
              <td data-column="watcher" className={live.watchOnly ? 'agents-watch-only' : 'agents-muted'}>{AgentsModel.watcherTextOf(job)}</td>
            </>
          )
          : null}
      </tr>
      {ask === null ? null : <AskUserRow jobId={job.id} ask={ask} columnCount={columnCount} now={now} />}
    </>
  );
}
