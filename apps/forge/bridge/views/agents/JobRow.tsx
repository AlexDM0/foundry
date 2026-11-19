/**
 * One job's row: its role glyph, id and role word; what it works on; its state with a quiet or not-counted tag; its calls against its
 * budget as a meter; its subagents as squares; its last tool call; its tokens. Diagnostics add its phase, tool calls and silent sweeps. A
 * job that asks User is marked and followed by its Asks User strip.
 */

import { StateBadge }     from 'design-system/StateBadge';
import { Tag }            from 'design-system/Tag';
import type { ReactNode } from 'react';

import { HashRouter }               from '../../shell/HashRouter.ts';
import { StateToneUtil }            from '../../utils/StateToneUtil.ts';
import type { AgentJobDocument }    from './AgentJobDocument.ts';
import { AgentsModel, type JobAsk } from './AgentsModel.ts';
import { ASKING_STATE, AskUserRow } from './AskUserRow.tsx';
import { CallBudgetMeter }          from './CallBudgetMeter.tsx';
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
        data-state-tone={ask === null ? undefined : StateToneUtil.toneOf(ASKING_STATE)}
      >
        <td data-column="job">
          <div className="agents-job-cell">
            <RoleGlyph mark={roleMark} label={roleMark.word} />
            <a className="agents-job-link" href={HashRouter.fragmentOf({ tab: 'agents', item: job.id })}>{job.id}</a>
            <span className="agents-muted" aria-hidden="true">{roleMark.word}</span>
          </div>
        </td>
        <td data-column="subject">{subject}</td>
        <td data-column="state">
          <div className="agents-state-cell">
            <StateBadge {...StateToneUtil.lookOfJobState(job.state)} label={job.state} />
            {quietText === null ? null : <Tag text={quietText} tone="warn" />}
            {counted === false ? <Tag text="not counted" tone="neutral" dashed /> : null}
          </div>
        </td>
        <td data-column="calls"><CallBudgetMeter job={job} laneState={roleMark.state} /></td>
        <td data-column="subagents"><SubagentSquares {...AgentsModel.subagentSquaresOf(job)} state={roleMark.state} /></td>
        <td data-column="last-tool"><LastToolCallCell lastToolCall={live.lastToolCall} silentSweeps={live.silentSweeps} now={now} /></td>
        <td data-column="tokens">{live.tokens.toLocaleString('en-US')}</td>
        {showDiagnostics
          ? (
            <>
              <td data-column="phase">{job.airlock?.phase ?? '-'}</td>
              <td data-column="tool-calls">{`${live.toolCalls} (${live.toolCallsWithSubagents} with subagents)`}</td>
              <td data-column="silent-sweeps">{live.silentSweeps}</td>
            </>
          )
          : null}
      </tr>
      {ask === null ? null : <AskUserRow jobId={job.id} ask={ask} columnCount={columnCount} now={now} />}
    </>
  );
}
