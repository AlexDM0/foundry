/**
 * The Agents view: its title row, the worker list (builders and reviewers, under the project row holding the launch-slot meter and the
 * concurrency limit), then Sessions (intake and the Assistant), both ticking each second, and for the job the route names its side panel,
 * which slides out again when the route drops the job. Show diagnostics adds the same four columns to both cards. Its clock and transcript
 * stream arrive as props, so a DOM spec drives both.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useState
} from 'react';

import type {
  ConcurrencyDocument,
  IdentifiedRecord,
  LaunchSlotsDocument,
  PageTicketDocument
} from '../../@types/BoardStateDocument.ts';
import { TranscriptStreamClient }                  from '../../api/TranscriptStreamClient.ts';
import type { BridgeClock }                        from '../../shell/BridgeClock.ts';
import { HashRouter }                              from '../../shell/HashRouter.ts';
import type { TimestampSlices }                    from '../../utils/TimeUtil.ts';
import { ViewTitle }                               from '../ViewTitle.tsx';
import type { AgentJobDocument }                   from './AgentJobDocument.ts';
import { AgentsModel }                             from './AgentsModel.ts';
import { JobPanel }                                from './JobPanel.tsx';
import { SessionCard }                             from './SessionCard.tsx';
import type { FollowTranscript, TranscriptMemory } from './TranscriptPanel.tsx';
import { WorkerCard }                              from './WorkerCard.tsx';

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
}

function useNowEverySecond(clock: BridgeClock): Date {
  const [now, setNow] = useState(() => clock.now());
  useEffect(() => clock.everySecond(() => setNow(clock.now())), [clock]);
  return now;
}

/** The job the panel shows: the routed one, else the last one shown while the panel slides out, until it is gone. */
function useShownJob(routedJob: AgentJobDocument | null, agentJobs: readonly AgentJobDocument[]) {
  const [shownJobId, setShownJobId] = useState<string | null>(routedJob?.id ?? null);
  if (routedJob !== null && routedJob.id !== shownJobId) setShownJobId(routedJob.id);
  const shownJob = routedJob ?? agentJobs.find((job) => job.id === shownJobId) ?? null;
  const finishClosing = useCallback(() => setShownJobId(null), []);
  return { shownJob, isClosing: routedJob === null, finishClosing };
}

const closeJobPanel = (): void => HashRouter.navigateTo({ tab: 'agents', item: null });

export function AgentsView({
  project, jobs, decisions, incidents, launchSlots, concurrency, tickets, selectedJobId, clock, timestampSlices, followTranscript = TranscriptStreamClient.follow
}: AgentsViewProps) {
  const now = useNowEverySecond(clock);
  const [transcriptMemory] = useState<TranscriptMemory>(() => new Map());
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const ticketTitles = useMemo(() => new Map(tickets.map((ticket) => [ticket.id, ticket.title])), [tickets]);
  const ticketTitleOf = (ticketId: string): string | null => ticketTitles.get(ticketId) ?? null;
  const agentJobs = jobs.filter(AgentsModel.isAgentJob);
  const workerJobs = agentJobs.filter((job) => AgentsModel.groupOf(job) === 'workers');
  const sessionJobs = agentJobs.filter((job) => AgentsModel.groupOf(job) === 'sessions');
  const selectedJob = agentJobs.find((job) => job.id === selectedJobId) ?? null;
  const { shownJob, isClosing, finishClosing } = useShownJob(selectedJob, agentJobs);

  return (
    <div className="agents-view" data-job-open={selectedJob === null ? undefined : ''}>
      <ViewTitle title="Agents" lead="The agents at work on this board. Select a job to read its transcript and steer it." />
      <WorkerCard
        project={project}
        jobs={workerJobs}
        decisions={decisions}
        launchSlots={launchSlots}
        concurrency={concurrency}
        ticketTitleOf={ticketTitleOf}
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
      {shownJob === null
        ? null
        : (
          <JobPanel
            job={shownJob}
            decisions={decisions}
            ticketTitleOf={ticketTitleOf}
            now={now}
            transcriptMemory={transcriptMemory}
            followTranscript={followTranscript}
            isClosing={isClosing}
            onClosed={finishClosing}
            onClose={closeJobPanel}
          />
        )}
    </div>
  );
}
