/**
 * The Agents card: builder and reviewer work under its project row, which holds the launch-slot meter, its figure and the concurrency
 * limit; a foot that says what the figure counts and names the tickets in progress that no job works on. The forge says which jobs hold
 * a slot (`launchSlots`); a job in this list that holds none is marked not counted.
 */

import { Fragment, type ReactNode } from 'react';

import type { BoardConcurrencyDocument, BoardLaunchSlotsDocument } from '../../../@types/board/BoardDocument.ts';
import type { BoardConcurrencyBoundsDocument }                     from '../../../@types/board/BoardFactDocuments.ts';
import { Button, Pane, SlotMeter }                                 from '../../../lib/design-system/DesignSystemInterface.ts';
import { JobLink, TicketLinks }                                    from '../../conversation/ConversationParts.tsx';
import { StateToneUtil }                                           from '../../utils/StateToneUtil.ts';
import type { TimestampSlices }                                    from '../../utils/TimeUtil.ts';
import type { AgentJobDocument, AskingDecisionDocument }           from './AgentJobDocument.ts';
import { AgentsModel, type SlotMeterFacts }                        from './AgentsModel.ts';
import { ConcurrencyLimitControl }                                 from './ConcurrencyLimitControl.tsx';
import { JobTable }                                                from './JobTable.tsx';
import { TicketChips }                                             from './TicketChips.tsx';

export interface WorkerCardProps {
  readonly project:             string;
  readonly jobs:                readonly AgentJobDocument[];
  readonly decisions:           readonly AskingDecisionDocument[];
  readonly launchSlots:         BoardLaunchSlotsDocument;
  readonly concurrency:         BoardConcurrencyDocument;
  readonly concurrencyBounds:   BoardConcurrencyBoundsDocument;
  readonly ticketTitleOf:       (ticketId: string) => string | null;
  readonly emptyText:           string;
  readonly selectedJobId:       string | null;
  readonly now:                 Date;
  readonly timestampSlices:     TimestampSlices;
  readonly showDiagnostics:     boolean;
  readonly onToggleDiagnostics: () => void;
}

function SlotFigure({ slotMeter }: { readonly slotMeter: SlotMeterFacts }) {
  return (
    <span className="agents-slots">
      <SlotMeter label={slotMeter.label} filled={slotMeter.counted} limit={slotMeter.limit} tone={StateToneUtil.toneOf('in-progress')} />
      <span className="agents-slot-figure" data-over={slotMeter.overLimit ? '' : undefined}>{`${slotMeter.counted} / ${slotMeter.limit}`}</span>
      <span className="agents-muted">workers</span>
    </span>
  );
}

function Reconciliation({ slotMeter, joblessTicketIds }: { readonly slotMeter: SlotMeterFacts; readonly joblessTicketIds: readonly string[] }) {
  const sentences: ReactNode[] = [
    <span key="counted">
      <strong className="agents-figure">{`${slotMeter.counted} / ${slotMeter.limit}`}</strong>
      {' workers counts builder and reviewer jobs'}
      {slotMeter.countedJobIds.length === 0
        ? null
        : (
          <>
            {' ('}
            {slotMeter.countedJobIds.map((jobId, position) => (
              <Fragment key={jobId}>
                {position === 0 ? null : ', '}
                <JobLink jobId={jobId} />
              </Fragment>
            ))}
            )
          </>
        )}
      .
    </span>,
  ];
  if (joblessTicketIds.length > 0) {
    sentences.push(
      <span key="jobless">
        <strong className="agents-figure">{joblessTicketIds.length}</strong>
        {joblessTicketIds.length === 1 ? ' ticket in progress has no Overseer job: ' : ' tickets in progress have no Overseer job: '}
        <TicketLinks ticketIds={joblessTicketIds} />
      </span>
    );
  }
  sentences.push(<span key="never">Subagents, intake and the Assistant never take a place.</span>);
  return (
    <div className="agents-reconciliation">
      {sentences.map((sentence, position) => (
        <Fragment key={position}>
          {position === 0 ? null : <span aria-hidden="true">·</span>}
          {sentence}
        </Fragment>
      ))}
    </div>
  );
}

export function WorkerCard({
  project, jobs, decisions, launchSlots, concurrency, concurrencyBounds, ticketTitleOf, emptyText, selectedJobId, now, timestampSlices, showDiagnostics,
  onToggleDiagnostics
}: WorkerCardProps) {
  const slotMeter = AgentsModel.slotMeterOf(launchSlots);
  const joblessTicketIds = launchSlots.inProgressTicketIdsWithoutJob;
  const askingCount = jobs.filter((job) => AgentsModel.openDecisionOf(decisions, job.id) !== null).length;
  const quietCount = jobs.filter((job) => job.live.silentSweeps > 0).length;
  return (
    <Pane
      label="Agents"
      title="Agents"
      subtitle="builders and reviewers · each holds one of the agents at most"
      countText={AgentsModel.cardCountTextOf(jobs.length, askingCount, quietCount)}
      headEnd={<Button label="Show diagnostics" compact pressed={showDiagnostics} onPress={onToggleDiagnostics} />}
      foot={<Reconciliation slotMeter={slotMeter} joblessTicketIds={joblessTicketIds} />}
      body="flush"
    >
      <JobTable
        variant="workers"
        project={project}
        projectLine={(
          <>
            <SlotFigure slotMeter={slotMeter} />
            <ConcurrencyLimitControl key={concurrency.limit} limit={concurrency.limit} bounds={concurrencyBounds} />
            <span className="agents-muted">{AgentsModel.workersLineTextOf(jobs.length, joblessTicketIds.length)}</span>
          </>
        )}
        groups={AgentsModel.projectGroupsOf(jobs, decisions, project)}
        decisions={decisions}
        emptyText={emptyText}
        subjectOf={(job) => <TicketChips job={job} ticketTitleOf={ticketTitleOf} />}
        countedOf={(jobId) => AgentsModel.isCounted(jobId, launchSlots)}
        selectedJobId={selectedJobId}
        now={now}
        timestampSlices={timestampSlices}
        showDiagnostics={showDiagnostics}
      />
    </Pane>
  );
}
