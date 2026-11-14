/**
 * The Agents view: the worker list (builders and reviewers, under the project row holding the launch-slot meter and the concurrency
 * limit), then Sessions (intake and the Assistant), both ticking each second, and for the job the route names, its controls and its
 * transcript. Show diagnostics adds the same four columns to both cards. Its clock and transcript stream arrive as props, so a DOM spec
 * drives both. The view is the agent panel habitat of Flint.
 */
import {
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';

import type {
  ConcurrencyDocument,
  IdentifiedRecord,
  LaunchSlotsDocument,
  OverseerFactsDocument,
  PageTicketDocument
} from '../../@types/BoardStateDocument.ts';
import { TranscriptStreamClient }                                        from '../../api/TranscriptStreamClient.ts';
import { Pane }                                                          from '../../design-system/Pane.tsx';
import { TitledBlock }                                                   from '../../design-system/TitledBlock.tsx';
import type { BridgeClock }                                              from '../../shell/BridgeClock.ts';
import type { TimestampSlices }                                          from '../../utils/TimeUtil.ts';
import type { EndedAgentJobDocument }                                    from './AgentJobDocument.ts';
import { AgentsModel }                                                   from './AgentsModel.ts';
import { JobControls }                                                   from './JobControls.tsx';
import { SessionCard }                                                   from './SessionCard.tsx';
import { TranscriptPanel, type FollowTranscript, type TranscriptMemory } from './TranscriptPanel.tsx';
import { useAgentPanelHabitat }                                          from './UseAgentPanelHabitat.ts';
import { WorkerCard }                                                    from './WorkerCard.tsx';

export interface AgentsViewProps {
  readonly project:           string;
  readonly jobs:              readonly IdentifiedRecord[];
  readonly decisions:         readonly IdentifiedRecord[];
  readonly incidents:         readonly IdentifiedRecord[];
  /** `null` on a board that serves no launch slots: no slot meter, and no job is marked not counted. */
  readonly launchSlots:       LaunchSlotsDocument | null;
  /** `null` on a board that states no limit: the limit control is not offered. */
  readonly concurrency:       ConcurrencyDocument | null;
  readonly tickets:           readonly Pick<PageTicketDocument, 'id' | 'title'>[];
  readonly selectedJobId:     string | null;
  readonly clock:             BridgeClock;
  /** How a full stamp is sliced; `null` on a board that serves no slices. */
  readonly timestampSlices:   TimestampSlices | null;
  readonly followTranscript?: FollowTranscript;
  /** The board's `endedJobs`, which Flint answers a landing from; without them it shows none. */
  readonly endedJobs?:        readonly EndedAgentJobDocument[];
  /** Without the Overseer's state, Flint is never told that every agent is idle. */
  readonly overseer?:         OverseerFactsDocument | null;
}

const NO_ENDED_JOBS: readonly EndedAgentJobDocument[] = Object.freeze([]);

function useNowEverySecond(clock: BridgeClock): Date {
  const [now, setNow] = useState(() => clock.now());
  useEffect(() => clock.everySecond(() => setNow(clock.now())), [clock]);
  return now;
}

export function AgentsView({
  project, jobs, decisions, incidents, launchSlots, concurrency, tickets, selectedJobId, clock, timestampSlices, followTranscript = TranscriptStreamClient.follow,
  endedJobs = NO_ENDED_JOBS, overseer = null
}: AgentsViewProps) {
  const now = useNowEverySecond(clock);
  const [transcriptMemory] = useState<TranscriptMemory>(() => new Map());
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const ticketTitles = useMemo(() => new Map(tickets.map((ticket) => [ticket.id, ticket.title])), [tickets]);
  const agentJobs = jobs.filter(AgentsModel.isAgentJob);
  const workerJobs = agentJobs.filter((job) => AgentsModel.groupOf(job) === 'workers');
  const sessionJobs = agentJobs.filter((job) => AgentsModel.groupOf(job) === 'sessions');
  const selectedJob = agentJobs.find((job) => job.id === selectedJobId) ?? null;
  const viewElement = useRef<HTMLDivElement>(null);
  useAgentPanelHabitat(viewElement, {
    jobs, endedJobs, concurrency, overseer
  }, selectedJobId);

  return (
    <div className="agents-view" ref={viewElement}>
      <WorkerCard
        project={project}
        jobs={workerJobs}
        decisions={decisions}
        launchSlots={launchSlots}
        concurrency={concurrency}
        ticketTitleOf={(ticketId) => ticketTitles.get(ticketId) ?? null}
        emptyText={agentJobs.length === 0 ? 'No agents are running.' : 'No builder or reviewer is working.'}
        selectedJobId={selectedJobId}
        now={now}
        timestampSlices={timestampSlices}
        showDiagnostics={showDiagnostics}
        onToggleDiagnostics={() => setShowDiagnostics((shown) => !shown)}
      />
      <SessionCard
        project={project}
        jobs={sessionJobs}
        decisions={decisions}
        openIncidentCount={incidents.length}
        selectedJobId={selectedJobId}
        now={now}
        timestampSlices={timestampSlices}
        showDiagnostics={showDiagnostics}
      />
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
