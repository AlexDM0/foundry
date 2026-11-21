/**
 * The Agents view: its title row, the worker list (builders and reviewers, under the project row holding the launch-slot meter and the
 * concurrency limit), then Sessions (intake and the Assistant), all ticking each second on the board's clock, and for the job the route
 * names its side panel, which slides out again when the route drops the job. Show diagnostics adds the same columns to both cards. Its
 * transcript stream arrives as a prop, so a DOM spec drives it. The view is the agent panel habitat of Flint.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';

import type { BoardDocument }             from '../../../@types/board/BoardDocument.ts';
import type { TranscriptFollower }        from '../../@types/BoardServices.ts';
import { useBoardClock, type BoardClock } from '../../shell/BoardClock.ts';
import { useBoardNavigation }             from '../../shell/BoardRouteLinks.ts';
import { IncidentNoticeModelUtil }        from '../../shell/IncidentNoticeModel.ts';
import { ViewTitle }                      from '../ViewTitle.tsx';
import type { AgentJobDocument }          from './AgentJobDocument.ts';
import type { PanelConcurrency }          from './AgentPanelSpriteModel.ts';
import { AgentsModel }                    from './AgentsModel.ts';
import { JobPanel }                       from './JobPanel.tsx';
import { SessionCard }                    from './SessionCard.tsx';
import type { TranscriptMemory }          from './TranscriptPanel.tsx';
import { useAgentPanelHabitat }           from './UseAgentPanelHabitat.ts';
import { WorkerCard }                     from './WorkerCard.tsx';

export type AgentsBoard = Pick<
  BoardDocument,
  'project' | 'jobs' | 'endedJobs' | 'decisions' | 'incidents' | 'launchSlots' | 'concurrency' | 'page' | 'overseer' | 'limits'
>;

export interface AgentsViewProps {
  readonly board:            AgentsBoard;
  readonly selectedJobId:    string | null;
  readonly followTranscript: TranscriptFollower;
}

function useNowEverySecond(clock: BoardClock): Date {
  const [now, setNow] = useState(() => clock.now());
  useEffect(() => clock.everySecond(() => setNow(clock.now())), [clock]);
  return now;
}

/** The job the panel shows: the routed one, else the last one shown while the panel slides out, until it is gone. */
function useShownJob(routedJob: AgentJobDocument | null, jobs: readonly AgentJobDocument[]) {
  const [shownJobId, setShownJobId] = useState<string | null>(routedJob?.id ?? null);
  if (routedJob !== null && routedJob.id !== shownJobId) setShownJobId(routedJob.id);
  const shownJob = routedJob ?? jobs.find((job) => job.id === shownJobId) ?? null;
  const finishClosing = useCallback(() => setShownJobId(null), []);
  return { shownJob, isClosing: routedJob === null, finishClosing };
}

function panelConcurrencyOf(board: Pick<AgentsBoard, 'concurrency' | 'page'>): PanelConcurrency {
  const { readyTickets } = board.page.facts;
  return {
    limit:          board.concurrency.limit,
    agentsInFlight: board.concurrency.agentsInFlight,
    readyTicketIds: readyTickets.map((ready) => ready.id),
    heldTicketIds:  readyTickets.filter((ready) => ready.isHeld).map((ready) => ready.id),
  };
}

export function AgentsView({ board, selectedJobId, followTranscript }: AgentsViewProps) {
  const {
    project, jobs, decisions, incidents, launchSlots, concurrency, page, endedJobs, overseer, limits
  } = board;
  const now = useNowEverySecond(useBoardClock());
  const navigateTo = useBoardNavigation();
  const [transcriptMemory] = useState<TranscriptMemory>(() => new Map());
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const ticketTitles = useMemo(() => new Map(page.tickets.map((ticket) => [ticket.id, ticket.title])), [page.tickets]);
  const ticketTitleOf = (ticketId: string): string | null => ticketTitles.get(ticketId) ?? null;
  const timestampSlices = IncidentNoticeModelUtil.timestampSlicesOf({ limits });
  const workerJobs = jobs.filter((job) => AgentsModel.groupOf(job) === 'workers');
  const sessionJobs = jobs.filter((job) => AgentsModel.groupOf(job) === 'sessions');
  const selectedJob = jobs.find((job) => job.id === selectedJobId) ?? null;
  const { shownJob, isClosing, finishClosing } = useShownJob(selectedJob, jobs);
  const viewElement = useRef<HTMLDivElement>(null);
  const panelConcurrency = useMemo(() => panelConcurrencyOf({ concurrency, page }), [concurrency, page]);
  useAgentPanelHabitat(viewElement, {
    jobs, endedJobs, concurrency: panelConcurrency, overseer
  }, selectedJobId);

  return (
    <div className="agents-view" ref={viewElement} data-job-open={selectedJob === null ? undefined : ''}>
      <ViewTitle title="Agents" lead="The agents at work on this board. Select a job to read its transcript and steer it." />
      <WorkerCard
        project={project}
        jobs={workerJobs}
        decisions={decisions}
        launchSlots={launchSlots}
        concurrency={concurrency}
        concurrencyBounds={limits.concurrency}
        ticketTitleOf={ticketTitleOf}
        emptyText={jobs.length === 0 ? 'No agents are running.' : 'No builder or reviewer is working.'}
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
            onClose={() => navigateTo({ tab: 'agents', item: null })}
          />
        )}
    </div>
  );
}
