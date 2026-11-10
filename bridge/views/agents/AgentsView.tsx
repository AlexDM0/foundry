/**
 * The Agents view: every job on the board with its live facts and subagents, ticking each second, the concurrency limit at the head of
 * the job card, and for the job the route names, its controls and its transcript. Its clock and transcript stream arrive as props, so a
 * DOM spec drives both.
 */
import { useEffect, useState } from 'react';

import type { ConcurrencyDocument, IdentifiedRecord }                    from '../../@types/BoardStateDocument.ts';
import { TranscriptStreamClient }                                        from '../../api/TranscriptStreamClient.ts';
import { EmptyState }                                                    from '../../design-system/ListSection.tsx';
import { Pane }                                                          from '../../design-system/Pane.tsx';
import { TitledBlock }                                                   from '../../design-system/TitledBlock.tsx';
import type { BridgeClock }                                              from '../../shell/BridgeClock.ts';
import { AgentsModel }                                                   from './AgentsModel.ts';
import { ConcurrencyLimitControl }                                       from './ConcurrencyLimitControl.tsx';
import { JobControls }                                                   from './JobControls.tsx';
import { JobRows }                                                       from './JobRows.tsx';
import { TranscriptPanel, type FollowTranscript, type TranscriptMemory } from './TranscriptPanel.tsx';

export interface AgentsViewProps {
  readonly jobs:              readonly IdentifiedRecord[];
  readonly decisions:         readonly IdentifiedRecord[];
  readonly selectedJobId:     string | null;
  /** `null` on a board that states no limit: the limit control is not offered. */
  readonly concurrency:       ConcurrencyDocument | null;
  readonly clock:             BridgeClock;
  readonly followTranscript?: FollowTranscript;
}

function useNowEverySecond(clock: BridgeClock): Date {
  const [now, setNow] = useState(() => clock.now());
  useEffect(() => clock.everySecond(() => setNow(clock.now())), [clock]);
  return now;
}

export function AgentsView({
  jobs, decisions, selectedJobId, concurrency, clock, followTranscript = TranscriptStreamClient.follow
}: AgentsViewProps) {
  const now = useNowEverySecond(clock);
  const [transcriptMemory] = useState<TranscriptMemory>(() => new Map());
  const agentJobs = jobs.filter(AgentsModel.isAgentJob);
  const selectedJob = agentJobs.find((job) => job.id === selectedJobId) ?? null;

  return (
    <div className="agents-view">
      <Pane
        label="Agents"
        title="Agents"
        countText={AgentsModel.jobCountTextOf(agentJobs.length)}
        body="flush"
        {...(concurrency === null ? {} : { headEnd: <ConcurrencyLimitControl key={concurrency.limit} limit={concurrency.limit} /> })}
      >
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
      </Pane>
      {selectedJob === null
        ? null
        : (
          <Pane key={selectedJob.id} label={`Job ${selectedJob.id}`} title="Job" titleMark={selectedJob.id} body="padded">
            <TitledBlock title="Controls" rule="between">
              <JobControls job={selectedJob} openDecision={AgentsModel.openDecisionOf(decisions, selectedJob.id)} />
            </TitledBlock>
            <TitledBlock title="Transcript" rule="between">
              <TranscriptPanel jobId={selectedJob.id} memory={transcriptMemory} followTranscript={followTranscript} />
            </TitledBlock>
          </Pane>
        )}
    </div>
  );
}
