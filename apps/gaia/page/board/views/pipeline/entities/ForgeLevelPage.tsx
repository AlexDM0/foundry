/**
 * The forge level of a monorepo's design (MonoDesignForge), in place of the phases: what every entity shares. The Ticket phase holds the
 * product owner's step, whose dialog sets its agent, and Human ticket review; the merge train holds Human code review and the Airlock's
 * conflict re-review, set in the merge step dialog; the board limit is the board's own setting, which applies at once, outside the
 * proposal, with each entity's cap under it; then a note that the forge level holds no gates, and the table of the entities, each linking
 * to its level. A switch goes to the draft through the flow's edit sender.
 */
import { Button }                                                 from 'design-system/Button';
import { NumberStepper }                                          from 'design-system/NumberStepper';
import { Row }                                                    from 'design-system/Row';
import { Switch }                                                 from 'design-system/Switch';
import { Text }                                                   from 'design-system/Text';
import { View }                                                   from 'design-system/View';
import { useState }                                               from 'react';
import type { BoardConcurrencyBoundsDocument }                    from '../../../../@types/board/BoardFactDocuments.ts';
import { CommandButton }                                          from '../../../shell/CommandButton.tsx';
import type { PipelineViewFacts }                                 from '../PipelineViewModel.ts';
import type { FlowSelection }                                     from '../flow/FlowSelection.ts';
import { usePipelineFlowEditSender, type PipelineFlowEditSender } from '../flow/PipelineFlowEditSender.ts';
import { PipelineFlowModel }                                      from '../flow/PipelineFlowModel.ts';
import { StepCard }                                               from '../flow/StepCard.tsx';
import { EntityOverviewTable }                                    from './EntityOverviewTable.tsx';
import { ForgeLevelPageModel, type ApprovalView }                 from './ForgeLevelPageModel.ts';
import { PhaseKicker }                                            from './PhaseKicker.tsx';

export interface ForgeLevelPageProps {
  /** The forge's own facts: its flow, the whole draft and every entity's part of the record. */
  readonly facts:        PipelineViewFacts;
  readonly selection:    FlowSelection;
  readonly entityHrefOf: (entityKey: string) => string;
}

const NO_GATES_TITLE = 'No gates at the Forge level.';

const NO_GATES_TEXT = 'A gate always belongs to an entity: its builder, reviewer and Airlock run it. Open an entity to see or change its gates.';

const BOARD_LIMIT_TEXT = 'How many jobs run at once, over every entity. This is the board’s setting: it applies at once, outside the proposal.';

interface ApprovalRowProps {
  readonly view:       ApprovalView;
  readonly editSender: PipelineFlowEditSender;
}

function ApprovalRow({ view, editSender }: ApprovalRowProps) {
  return (
    <Row between centerY gap="twelve">
      <View>
        <Text bold>{view.title}</Text>
        <Text typeRole="tab" muted>{view.hint}</Text>
      </View>
      <Switch
        accessibleName={view.title}
        checked={view.isOn}
        disabled={!editSender.enabled}
        onToggle={() => editSender.sendEdits([ForgeLevelPageModel.approvalEditOf(view)])}
      />
    </Row>
  );
}

function BoardLimit({ limit, bounds, capLines }: { readonly limit: number; readonly bounds: BoardConcurrencyBoundsDocument; readonly capLines: readonly string[] }) {
  const [wantedLimit, setWantedLimit] = useState(limit);
  return (
    <section className="board-forge-level-section" aria-label="Board limit">
      <Text typeRole="lead" bold element="h3">Board limit</Text>
      <Text muted element="p">{BOARD_LIMIT_TEXT}</Text>
      <Row centerY gap="ten" wrap>
        <NumberStepper
          accessibleName="Board limit in jobs"
          value={wantedLimit}
          step={1}
          minimum={bounds.lowest}
          maximum={bounds.ceiling}
          unitText="jobs"
          lowerLabel="Fewer jobs at once"
          raiseLabel="More jobs at once"
          onChange={setWantedLimit}
        />
        <Text muted>{ForgeLevelPageModel.jobsAtOnceTextOf(wantedLimit)}</Text>
        <CommandButton compact label="Set now" command={ForgeLevelPageModel.boardLimitCommandOf(wantedLimit, limit, bounds)} />
      </Row>
      {capLines.map((line) => <Text key={line} typeRole="small" subtle element="p">{line}</Text>)}
    </section>
  );
}

export function ForgeLevelPage({ facts, selection, entityHrefOf }: ForgeLevelPageProps) {
  const record = facts.pipeline.setup?.record ?? null;
  const livePipeline = facts.pipeline.applied.readingVerdict === 'readable' ? facts.pipeline.applied.pipeline : null;
  const draft = record?.draft ?? livePipeline;
  const editSender = usePipelineFlowEditSender(record === null ? null : { setupId: record.setupId, draftRevision: record.draftRevision });
  const nodes = facts.pipeline.flow?.nodes ?? [];
  const ticketNode = nodes.find((node) => node.nodeKind === 'ticket-creation') ?? null;
  const airlockNode = ForgeLevelPageModel.airlockMergeNodeOf(nodes);
  const [ticketsApproval, mergeApproval] = ForgeLevelPageModel.approvalViewsOf(draft);
  const entityFacts = facts.pipeline.setup?.entities ?? {};
  return (
    <div className="board-forge-level">
      {editSender.refusal === null ? null : <span className="board-refusal" role="status">{editSender.refusal}</span>}
      <div className="board-forge-level-phases">
        <section className="board-forge-level-section" aria-label="Ticket phase">
          <PhaseKicker phase="ticket" text="Ticket phase · every entity" />
          <Text typeRole="section" element="h3">Tickets</Text>
          {ticketNode === null
            ? null
            : (
              <div className="board-forge-level-step">
                <StepCard
                  view={PipelineFlowModel.nodeViewOf(ticketNode, PipelineFlowModel.flowWordingOf(facts))}
                  occupants={null}
                  questionCount={0}
                  selected={false}
                  editable={editSender.enabled}
                  onOpen={selection.open}
                  onEdits={editSender.sendEdits}
                />
              </div>
            )}
          {ticketsApproval === undefined ? null : <ApprovalRow view={ticketsApproval} editSender={editSender} />}
        </section>
        <section className="board-forge-level-section" aria-label="Merge and the Airlock">
          <PhaseKicker phase="merge" text="Merge phase · every entity" />
          <Text typeRole="section" element="h3">Merge and the Airlock</Text>
          {mergeApproval === undefined ? null : <ApprovalRow view={mergeApproval} editSender={editSender} />}
          <Row between centerY gap="twelve">
            <View>
              <Text bold>Conflict re-review</Text>
              <Text typeRole="tab" muted>{`A conflict fix over this many lines gets a clean re-review: ${ForgeLevelPageModel.conflictReReviewTextOf(draft)}.`}</Text>
            </View>
            {airlockNode === null
              ? null
              : (
                <Button
                  compact
                  label="Change"
                  accessibleName="Change the conflict re-review"
                  onPress={() => selection.open({ kind: 'node', nodeId: airlockNode.nodeId, action: { kind: 'dialog', dialog: 'merge-step', focusesReReview: true }, })}
                />
              )}
          </Row>
        </section>
      </div>
      <BoardLimit key={facts.concurrency.limit} limit={facts.concurrency.limit} bounds={facts.limits.concurrency} capLines={ForgeLevelPageModel.entityCapLinesOf(draft)} />
      <section className="board-forge-level-no-gates" aria-label="Gates">
        <Text bold>{NO_GATES_TITLE}</Text>
        <Text muted>{NO_GATES_TEXT}</Text>
      </section>
      <section className="board-forge-level-section" aria-label="Entities">
        <Row centerY gap="ten">
          <Text typeRole="lead" bold element="h3">Entities</Text>
          <Text typeRole="tab" subtle mono>{String(ForgeLevelPageModel.entityKeysOf(draft).length)}</Text>
          <Text muted>Open one to design its pipeline</Text>
        </Row>
        <EntityOverviewTable
          facts={{
            entities:          draft?.entities ?? {},
            setupParts:        record?.entities ?? {},
            openQuestionCount: (entityKey) => (Object.hasOwn(entityFacts, entityKey) ? entityFacts[entityKey]?.openQuestionCount ?? 0 : 0),
          }}
          hrefOf={entityHrefOf}
        />
      </section>
    </div>
  );
}
