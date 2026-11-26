/**
 * The selected job's side panel, docked under the tab bar: its head names the job and its state; then Flint, the job's agent, beside the
 * job's facts (role, tickets, calls, last tool, subagents); for a job that waits for a resume, what it waits for as the forge serves it;
 * the job's controls; its transcript; and in the foot the message box where the job takes messages.
 */
import {
  MonoId,
  Row,
  SidePanel,
  SidePanelBody,
  SidePanelFoot,
  SidePanelHead,
  StateDot,
  Text,
  View
} from '../../../lib/design-system/DesignSystemInterface.ts';

import type { TranscriptFollower }                    from '../../@types/BoardServices.ts';
import { FlintSlotHabitat }                           from '../../flint/FlintSlotHabitat.tsx';
import { FLINT_SLOT_HABITATS }                        from '../../flint/FlintSlotHabitats.ts';
import { useCoveringPanelHoldsTheFlintSlot }          from '../../shared/CoveringPanel.ts';
import { ElapsedTimeUtil }                            from '../../utils/ElapsedTimeUtil.ts';
import { FlintSlotCueUtil }                           from '../../utils/FlintSlotCueUtil.ts';
import { StateToneUtil }                              from '../../utils/StateToneUtil.ts';
import type { AgentJobDocument, JobDecisionDocument } from './AgentJobDocument.ts';
import { AgentsModel }                                from './AgentsModel.ts';
import { CallBudgetMeter }                            from './CallBudgetMeter.tsx';
import { JobControls }                                from './JobControls.tsx';
import { JobMessageBox }                              from './JobMessageBox.tsx';
import { LastToolCallCell }                           from './LastToolCallCell.tsx';
import { RoleGlyph }                                  from './RoleGlyph.tsx';
import { SubagentSquares }                            from './SubagentSquares.tsx';
import { TicketChips }                                from './TicketChips.tsx';
import { TranscriptPanel, type TranscriptMemory }     from './TranscriptPanel.tsx';

const TAB_BAR_SELECTOR = '.board-tab-bar';

/** The panel's top follows the tab bar's end as the header scrolls away. */
function tabBarOf(): Element | null {
  return document.querySelector(TAB_BAR_SELECTOR);
}

export interface JobPanelProps {
  readonly job:              AgentJobDocument;
  readonly decisions:        readonly JobDecisionDocument[];
  readonly ticketTitleOf:    (ticketId: string) => string | null;
  readonly now:              Date;
  readonly transcriptMemory: TranscriptMemory;
  readonly followTranscript: TranscriptFollower;
  /** True while the panel slides out; `onClosed` is called once it is gone. */
  readonly isClosing:        boolean;
  readonly onClosed:         () => void;
  readonly onClose:          () => void;
}

function JobPanelHead({ job, now }: { readonly job: AgentJobDocument; readonly now: Date }) {
  const launchedText = ElapsedTimeUtil.elapsedSinceText(job.launchedAt, now);
  return (
    <Row gap="eight" centerY>
      <Text typeRole="title" bold element="h2">Job</Text>
      <MonoId text={job.id} />
      <StateDot {...StateToneUtil.dotOfJob(job)} />
      <Text typeRole="tab" muted>{AgentsModel.panelStateTextOf(job, launchedText)}</Text>
    </Row>
  );
}

function JobFacts({ job, ticketTitleOf, now }: Pick<JobPanelProps, 'job' | 'ticketTitleOf' | 'now'>) {
  const roleMark = AgentsModel.roleMarkOf(job);
  return (
    <View gap="seven">
      <Row gap="eight" centerY>
        <RoleGlyph mark={roleMark} label={roleMark.word} />
        <Text bold>{roleMark.word}</Text>
        <Text typeRole="tab" muted>{`attempt ${job.attempt}`}</Text>
      </Row>
      {job.ticketIds.length === 0 ? null : <TicketChips job={job} ticketTitleOf={ticketTitleOf} />}
      <Row gap="eight" centerY>
        <CallBudgetMeter job={job} laneState={roleMark.state} />
        <Text typeRole="tab" muted>{`calls · ${job.live.tokens.toLocaleString('en-US')} tokens`}</Text>
      </Row>
      <Row gap="six" centerY>
        <Text typeRole="tab" muted>Last tool</Text>
        <LastToolCallCell lastToolCall={job.live.lastToolCall} silentSweeps={job.live.silentSweeps} now={now} />
      </Row>
      <SubagentSquares {...AgentsModel.subagentSquaresOf(job)} state={roleMark.state} oneLine />
    </View>
  );
}

export function JobPanel({
  job, decisions, ticketTitleOf, now, transcriptMemory, followTranscript, isClosing, onClosed, onClose
}: JobPanelProps) {
  const flintSlotIsCovered = useCoveringPanelHoldsTheFlintSlot();
  return (
    <SidePanel label={`Job ${job.id}`} width="detail" dockBelow={tabBarOf} isClosing={isClosing} onClosed={onClosed}>
      <SidePanelHead closeLabel="Close the job panel" onClose={onClose}>
        <JobPanelHead job={job} now={now} />
      </SidePanelHead>
      <SidePanelBody contentKey={job.id}>
        <View gap="fourteen">
          <Row gap="fourteen">
            {flintSlotIsCovered
              ? null
              : (
                <FlintSlotHabitat
                  habitat={FLINT_SLOT_HABITATS.agents}
                  cue={FlintSlotCueUtil.cueOfJob(job)}
                  label="Flint, the selected job's agent"
                  size="112"
                  ground="lane"
                />
              )}
            <JobFacts job={job} ticketTitleOf={ticketTitleOf} now={now} />
          </Row>
          {job.waitsFor === null ? null : <p className="agents-resume-wait">{AgentsModel.resumeWaitTextOf(job.waitsFor)}</p>}
          <JobControls job={job} openDecision={AgentsModel.openDecisionOf(decisions, job.id)} />
          <TranscriptPanel jobId={job.id} memory={transcriptMemory} followTranscript={followTranscript} />
        </View>
      </SidePanelBody>
      {AgentsModel.takesMessages(job)
        ? (
          <SidePanelFoot>
            <JobMessageBox key={job.id} jobId={job.id} />
          </SidePanelFoot>
        )
        : null}
    </SidePanel>
  );
}
