/**
 * The Agents view: every job on the board with its live facts and subagents, ticking each second, and for the job the route names, its
 * controls and its transcript. Its clock and transcript stream arrive as props, so a DOM spec drives both.
 */
import { useEffect, useState } from 'react';

import type { IdentifiedRecord }                                         from '../../@types/BoardStateDocument.ts';
import { TranscriptStreamClient }                                        from '../../api/TranscriptStreamClient.ts';
import { EmptyState }                                                    from '../../design-system/ListSection.tsx';
import { MonoId }                                                        from '../../design-system/MonoId.tsx';
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

  return (
    <div className="agents-view">
      <section className="agents-card" aria-label="Agents">
        <div className="agents-card-head">
          <h2 className="agents-card-title">Agents</h2>
          <span className="agents-card-count">{AgentsModel.jobCountTextOf(agentJobs.length)}</span>
        </div>
        {agentJobs.length === 0
          ? <EmptyState text="No agents are running." />
          : (
            <div className="agents-scroll">
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
            </div>
          )}
      </section>
      {selectedJob === null
        ? null
        : (
          <section key={selectedJob.id} className="agents-card" aria-label={`Job ${selectedJob.id}`}>
            <div className="agents-card-head">
              <h2 className="agents-card-title">
                {'Job '}
                <MonoId text={selectedJob.id} />
              </h2>
            </div>
            <div className="agents-card-body">
              <section className="agents-section" aria-label="Controls">
                <h3 className="agents-section-title">Controls</h3>
                <JobControls job={selectedJob} openDecision={AgentsModel.openDecisionOf(decisions, selectedJob.id)} />
              </section>
              <section className="agents-section" aria-label="Transcript">
                <h3 className="agents-section-title">Transcript</h3>
                <TranscriptPanel jobId={selectedJob.id} memory={transcriptMemory} followTranscript={followTranscript} />
              </section>
            </div>
          </section>
        )}
    </div>
  );
}
