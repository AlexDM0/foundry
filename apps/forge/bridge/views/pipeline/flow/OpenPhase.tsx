/**
 * The open phase: its header (its number, name and purpose, when it leaves and the Next button, or for Merge the end on main and, on a
 * live board, the tickets in the merge train), its steps from left to right with an add card wherever the facts name a missing step, and
 * under them the phase's gates table, or for the Ticket phase what makes a draft ready. Its switches, add choices and gate edits go
 * through one draft edit sender, which opens an update first on a live board. At an entity's level of a monorepo screen the phases are
 * three, a switch the forge sets links there in place of the switch, an add choice the forge would set is not offered, and the gates table
 * offers to copy the phase's gates to another entity.
 */

import { Button }         from 'design-system/Button';
import { Row }            from 'design-system/Row';
import { Tag }            from 'design-system/Tag';
import { Text }           from 'design-system/Text';
import type { ReactNode } from 'react';

import type { PipelineFlowFacts }                                           from '../../../../src/lib/tracker-model/@types/PipelineFacts.ts';
import { PipelineDraftEditUtil }                                            from '../../../../src/lib/tracker-model/utils/PipelineDraftEditUtil.ts';
import { StateToneUtil }                                                    from '../../../utils/StateToneUtil.ts';
import type { PipelineViewFacts }                                           from '../PipelineViewModel.ts';
import { PipelineAgentPanelModel }                                          from '../agent-panel/PipelineAgentPanelModel.ts';
import { EntityLevelFactsModel }                                            from '../entities/EntityLevelFactsModel.ts';
import { entityKeyOfScope, useMonorepoLevelScope, type MonorepoLevelScope } from '../entities/MonorepoLevelContext.ts';
import { CopyToEntityMenu }                                                 from '../gates/CopyToEntityMenu.tsx';
import { GatesTable }                                                       from '../gates/GatesTable.tsx';
import { FlowActivityPanelModel, type OccupantChipView }                    from '../live/FlowActivityPanelModel.ts';

import { FlowGlyph }                                                      from './FlowGlyph.tsx';
import { selectedGateRowKeyOf, selectedStepNodeIdOf, type FlowSelection } from './FlowSelection.ts';
import { InsertSlot }                                                     from './InsertSlot.tsx';
import { usePipelineFlowEditSender }                                      from './PipelineFlowEditSender.ts';
import { PipelineFlowModel, type FlowSlotView }                           from './PipelineFlowModel.ts';
import {
  ENTITY_PHASES,
  PIPELINE_PHASES,
  PipelinePhaseModel,
  type PhaseStepItem,
  type PipelinePhase
} from './PipelinePhaseModel.ts';
import { StepCard } from './StepCard.tsx';

export interface OpenPhaseProps {
  readonly facts:     PipelineViewFacts;
  readonly flow:      PipelineFlowFacts;
  readonly selection: FlowSelection;
}

function ticketsOn(flow: PipelineFlowFacts, nodeIds: readonly string[]): OccupantChipView[] {
  return nodeIds.flatMap((nodeId) => FlowActivityPanelModel.occupantChipsOf(flow, nodeId));
}

function TicketChips({ tickets }: { readonly tickets: readonly OccupantChipView[] }) {
  return tickets.map((ticket) => <Tag key={ticket.key} text={ticket.text} {...StateToneUtil.tagLookOf(ticket.state)} dot href={ticket.href} />);
}

/** The live Merge header's lines: the ticket the Airlock lets onto main, and the tickets queued for the train. */
function MergeTrainLines({ flow }: { readonly flow: PipelineFlowFacts }) {
  const inTrain = ticketsOn(flow, PipelinePhaseModel.trainNodeIdsOf(flow));
  const queued = ticketsOn(flow, PipelinePhaseModel.queueNodeIdsOf(flow));
  return (
    <>
      {inTrain.length === 0
        ? null
        : (
          <Row centerY gap="seven" wrap>
            <Text typeRole="tab" muted>Airlock:</Text>
            <TicketChips tickets={inTrain} />
            <Text typeRole="tab" muted>merging onto main</Text>
          </Row>
        )}
      {queued.length === 0
        ? null
        : (
          <Row centerY gap="seven" wrap>
            <Text typeRole="tab" muted>Queued for the merge train:</Text>
            <TicketChips tickets={queued} />
          </Row>
        )}
    </>
  );
}

interface PhaseHeadProps {
  readonly flow:   PipelineFlowFacts;
  readonly phase:  PipelinePhase;
  readonly phases: readonly PipelinePhase[];
  readonly onOpen: (phase: PipelinePhase) => void;
}

function PhaseHead({
  flow, phase, phases, onOpen
}: PhaseHeadProps) {
  const header = PipelinePhaseModel.headerOf(flow, phase, phases);
  const { nextPhase } = header;
  return (
    <header className="bridge-pipeline-phase-head">
      <div key={phase} className="bridge-pipeline-phase-head-text">
        <Row centerY gap="seven">
          <span className="bridge-pipeline-phase-dot" data-phase={phase} aria-hidden="true" />
          <Text typeRole="small" muted>{header.numberText}</Text>
        </Row>
        <Text typeRole="phase" element="h3">{header.name}</Text>
        <Text typeRole="lead" muted>{header.purpose}</Text>
        {phase === 'merge' && flow.toolbarStage === 'live' ? <MergeTrainLines flow={flow} /> : null}
      </div>
      <div className="bridge-pipeline-phase-head-end">
        <Text typeRole="tab" muted>
          {`${header.endLead} `}
          <Text typeRole="tab" bold>{header.endText}</Text>
        </Text>
        {nextPhase === null
          ? <span className="bridge-pipeline-phase-done">{PipelinePhaseModel.DONE_ON_MAIN_TEXT}</span>
          : <Button compact label={PipelinePhaseModel.nextLabelOf(nextPhase)} onPress={() => onOpen(nextPhase)} />}
      </div>
    </header>
  );
}

function TicketReadiness() {
  return (
    <section className="bridge-pipeline-readiness" aria-label="What makes a draft ready">
      <Row centerY gap="ten" wrap>
        <Text typeRole="lead" bold element="h3">No gates in this phase</Text>
        <Text muted>A draft is ready to build when it has both of these</Text>
      </Row>
      <ul className="bridge-pipeline-readiness-lines">
        {PipelinePhaseModel.TICKET_READINESS.map((line) => (
          <li key={line.key} className="bridge-pipeline-readiness-line">
            <FlowGlyph glyph="check" />
            <Text bold>{line.title}</Text>
            <Text muted>{line.text}</Text>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** At an entity, the add choices that would set what the forge sets for every entity are left out. */
function slotViewAtLevelOf(slot: FlowSlotView, scope: MonorepoLevelScope | null): FlowSlotView {
  if (scope?.level.kind !== 'entity') return slot;
  return {
    ...slot,
    choices: slot.choices.filter((choice) => choice.action.kind !== 'edit' || !choice.action.edits.some((edit) => EntityLevelFactsModel.fieldIsSetAtTheForge(PipelineDraftEditUtil.fieldOf(edit)))),
  };
}

export function OpenPhase({ facts, flow, selection }: OpenPhaseProps) {
  const scope = useMonorepoLevelScope();
  const entityKey = entityKeyOfScope(scope);
  const phases = entityKey === null ? PIPELINE_PHASES : ENTITY_PHASES;
  const record = facts.pipelineSetup?.record ?? null;
  const live = flow.toolbarStage === 'live';
  const editTarget = record === null ? null : { setupId: record.setupId, draftRevision: record.draftRevision };
  const editSender = usePipelineFlowEditSender(live ? null : editTarget);
  const livePipeline = facts.pipeline?.readingVerdict === 'readable' ? facts.pipeline.pipeline : null;
  const draft = record?.draft ?? livePipeline;
  const openQuestionIds = PipelineAgentPanelModel.openQuestionIdsOf(record?.questions ?? []);
  const phase = selection.openPhase;
  const viewById = new Map(PipelineFlowModel.nodeViewsOf(flow, facts.pipelineChoices?.efforts ?? [], facts.gateCacheMarks ?? []).map((view) => [view.nodeId, view]));
  const selectedStepNodeId = selectedStepNodeIdOf(selection);
  const gatePhase = PipelinePhaseModel.gatePhaseOf(phase);

  const cardOf = (item: PhaseStepItem): ReactNode => {
    if (item.kind === 'add') {
      const slot = slotViewAtLevelOf(PipelineFlowModel.slotViewOf(item.slot, item.place, draft), scope);
      if (slot.choices.length === 0) return null;
      return (
        <InsertSlot
          key={`add-${item.slot.slotId}`}
          slot={slot}
          disabled={!editSender.enabled}
          onEdits={editSender.sendEdits}
          onNewGate={(newGatePhase) => selection.open({ kind: 'new-gate', phase: newGatePhase })}
        />
      );
    }
    const view = viewById.get(item.node.nodeId);
    if (view === undefined) return null;
    return (
      <StepCard
        key={view.nodeId}
        view={view}
        occupants={live ? FlowActivityPanelModel.occupantChipsOf(flow, view.nodeId) : null}
        questionCount={PipelineFlowModel.openQuestionCountOf(item.node, openQuestionIds)}
        selected={selectedStepNodeId === view.nodeId}
        editable={editSender.enabled}
        onOpen={selection.open}
        onEdits={editSender.sendEdits}
        {...(scope === null || entityKey === null ? {} : { setAtTheForgeHref: scope.forgeLevelHref })}
      />
    );
  };
  /** The cards from left to right, a small arrow before each but the first. */
  const stepRow = PipelinePhaseModel.stepItemsOf(flow, phase).reduce<ReactNode[]>((drawn, item) => {
    const card = cardOf(item);
    if (card === null) return drawn;
    return drawn.length === 0 ? [card] : [...drawn, <FlowGlyph key={`arrow-${drawn.length}`} glyph="arrow" />, card];
  }, []);

  return (
    <section className="bridge-pipeline-phase" aria-label={PipelinePhaseModel.phaseLabelOf(phase, phases)} data-phase={phase} data-stage={flow.toolbarStage}>
      <PhaseHead flow={flow} phase={phase} phases={phases} onOpen={selection.openPhaseOf} />
      {editSender.refusal === null ? null : <span className="bridge-refusal" role="status">{editSender.refusal}</span>}
      {stepRow.length === 0 ? null : <div className="bridge-pipeline-phase-steps">{stepRow}</div>}
      {gatePhase === null
        ? <TicketReadiness />
        : (
          <GatesTable
            phase={gatePhase}
            rows={flow.gateRows[gatePhase]}
            profileRuns={facts.profileRuns ?? []}
            profileSetupId={live ? null : editTarget?.setupId ?? null}
            reviewRuns={flow.nodes.some((node) => node.nodeKind === 'review' && node.mark !== 'removed')}
            nowTickets={live ? ticketsOn(flow, flow.nodes.filter((node) => node.nodeKind === 'gates' && node.phase === gatePhase).map((node) => node.nodeId)) : null}
            selectedRowKey={selectedGateRowKeyOf(selection)}
            editSender={editSender}
            onOpen={selection.open}
            headStart={entityKey !== null && !live && editTarget !== null && scope !== null && scope.wholeDraft !== null
              ? <CopyToEntityMenu phase={gatePhase} fromEntityKey={entityKey} wholeDraft={scope.wholeDraft} target={editTarget} />
              : null}
          />
        )}
    </section>
  );
}
