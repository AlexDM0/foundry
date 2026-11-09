/**
 * The Agents view: every job on the board with its live facts and subagents, ticking each second, and for the job the route names, its
 * controls and its transcript. Its clock and transcript stream arrive as props, so a DOM spec drives both.
 */
import { useEffect, useState } from 'react';

import type { IdentifiedRecord }                                         from '../../@types/BoardStateDocument.ts';
import { TranscriptStreamClient }                                        from '../../api/TranscriptStreamClient.ts';
import type { BridgeClock }                                              from '../../shell/BridgeClock.ts';
import { AgentsModel }                                                   from './AgentsModel.ts';
import { JobControls }                                                   from './JobControls.tsx';
import { JobRows }                                                       from './JobRows.tsx';
import { TranscriptPanel, type FollowTranscript, type TranscriptMemory } from './TranscriptPanel.tsx';

export interface AgentsViewProps {
  readonly jobs:              readonly IdentifiedRecord[];
  readonly decisions:         readonly IdentifiedRecord[];
  readonly selectedJobId:     string | null;
  readonly clock:             BridgeClock;
  readonly followTranscript?: FollowTranscript;
}

function useNowEverySecond(clock: BridgeClock): Date {
  const [now, setNow] = useState(() => clock.now());
  useEffect(() => clock.everySecond(() => setNow(clock.now())), [clock]);
  return now;
}

export function AgentsView({
  jobs, decisions, selectedJobId, clock, followTranscript = TranscriptStreamClient.follow
}: AgentsViewProps) {
  const now = useNowEverySecond(clock);
  const [transcriptMemory] = useState<TranscriptMemory>(() => new Map());
  const agentJobs = jobs.filter(AgentsModel.isAgentJob);
  const selectedJob = agentJobs.find((job) => job.id === selectedJobId) ?? null;

  if (agentJobs.length === 0) return <p className="bridge-empty">No agents are running.</p>;
  return (
    <section className="agents-view">
      <table className="agents-table">
        <thead>
          <tr>
            <th>Job</th>
            <th>Kind</th>
            <th>Tickets</th>
            <th>State</th>
            <th>Phase</th>
            <th>Calls</th>
            <th>Tool calls</th>
            <th>Tokens</th>
            <th>Last tool</th>
            <th>Silent sweeps</th>
            <th>Watcher</th>
          </tr>
        </thead>
        <tbody>
          {agentJobs.map((job) => <JobRows key={job.id} job={job} selected={job.id === selectedJobId} now={now} />)}
        </tbody>
      </table>
      {selectedJob === null
        ? null
        : (
          <section key={selectedJob.id} className="agents-job-panel" aria-label={`Job ${selectedJob.id}`}>
            <h2 className="agents-job-heading">{`Job ${selectedJob.id}`}</h2>
            <JobControls job={selectedJob} openDecision={AgentsModel.openDecisionOf(decisions, selectedJob.id)} />
            <TranscriptPanel jobId={selectedJob.id} memory={transcriptMemory} followTranscript={followTranscript} />
          </section>
        )}
    </section>
  );
}
