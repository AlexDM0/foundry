/**
 * The forge level of a live monorepo pipeline (MonoLive), in place of the phases: what every entity shares, as it runs now. The Ticket
 * phase holds the product owner's step with the drafts it writes and the two approvals as they are applied; the merge train lists the
 * ticket in the Airlock and the queue behind it, each with its entity; the board's jobs in flight stand against its limit, and each
 * entity's jobs against its cap with the tickets waiting for a slot; and a note says that gates belong to an entity. After the first
 * Apply over entities, the Ticket phase also counts the product owner's entity assignments and opens their progress. Nothing here
 * changes the pipeline: an update does that.
 */
import { DataTable }      from 'design-system/DataTable';
import { MonoId }         from 'design-system/MonoId';
import { Row }            from 'design-system/Row';
import { Tag }            from 'design-system/Tag';
import { Text }           from 'design-system/Text';
import { View }           from 'design-system/View';
import type { ReactNode } from 'react';

import type { PipelineFlowFacts } from '../../../../src/lib/tracker-model/@types/PipelineFacts.ts';
import { StateToneUtil }          from '../../../utils/StateToneUtil.ts';
import { EntityAssignmentLine }   from '../apply/EntityAssignmentProgress.tsx';
import { ForgeLevelPageModel }    from '../entities/ForgeLevelPageModel.ts';
import { PhaseKicker }            from '../entities/PhaseKicker.tsx';
import type { FlowSelection }     from '../flow/FlowSelection.ts';
import { PipelineFlowModel }      from '../flow/PipelineFlowModel.ts';
import { StepCard }               from '../flow/StepCard.tsx';
import { EntityWorkModel }        from './EntityWorkModel.ts';
import { FlowActivityPanelModel } from './FlowActivityPanelModel.ts';
import { ForgeLevelLiveModel }    from './ForgeLevelLiveModel.ts';
import type { LivePipelineFacts } from './LivePipelineModel.ts';

type MergeTrainColumn = 'position' | 'ticket' | 'entity' | 'state' | 'waiting';

type EntityConcurrencyColumn = 'entity' | 'cap' | 'running' | 'waiting';

export interface ForgeLevelLiveProps {
  /** The forge's own facts: its flow, with every entity's tickets on it, and the applied pipeline. */
  readonly facts:     LivePipelineFacts;
  readonly selection: FlowSelection;
  readonly now:       Date;
}

const MERGE_TRAIN_COLUMNS = [
  { key: 'position', label: 'Place', labelHidden: true },
  { key: 'ticket', label: 'Ticket' },
  { key: 'entity', label: 'Entity' },
  { key: 'state', label: 'State' },
  { key: 'waiting', label: 'Waiting', align: 'end' },
] as const;

const MERGE_TRAIN_COLUMN_WIDTHS = '32px minmax(0, 0.7fr) minmax(0, 0.9fr) minmax(0, 2fr) minmax(0, 0.6fr)';

const ENTITY_CONCURRENCY_COLUMNS = [
  { key: 'entity', label: 'Entity' },
  { key: 'cap', label: 'Cap' },
  { key: 'running', label: 'Running now' },
  { key: 'waiting', label: 'Waiting for a slot' },
] as const;

const ENTITY_CONCURRENCY_COLUMN_WIDTHS = 'minmax(0, 1fr) minmax(0, 0.8fr) minmax(0, 1.2fr) minmax(0, 1.6fr)';

const NO_GATES_TITLE = 'No gates at the Forge level.';

const NO_GATES_TEXT = 'A gate always belongs to an entity: its builder, reviewer and Airlock run it. Pick an entity on the left to see its gates.';

function MergeTrain({ facts, flow, now }: { readonly facts: LivePipelineFacts; readonly flow: PipelineFlowFacts; readonly now: Date }) {
  const rows = ForgeLevelLiveModel.mergeTrainRowsOf(flow, now, (ticketId) => EntityWorkModel.ticketEntityOf(ticketId, facts)).map((row) => ({
    key:   row.key,
    cells: {
      position: <Text typeRole="small" subtle mono>{row.positionText}</Text>,
      ticket:   <a href={row.href} aria-label={`Open ticket ${row.ticketId}`}><MonoId text={row.ticketId} tone="link" weight="medium" /></a>,
      entity:   row.entityKey === null ? <Text typeRole="small" subtle>No entity yet</Text> : <MonoId text={row.entityKey} tone="strong" />,
      state:    <Text bold={row.inAirlock} muted={!row.inAirlock}>{row.stateText}</Text>,
      waiting:  <Text typeRole="small" subtle>{row.waitingText}</Text>,
    } satisfies Record<MergeTrainColumn, ReactNode>,
  }));
  if (rows.length === 0) return <Text muted element="p">No ticket is in the merge train now.</Text>;
  return <DataTable label="Merge train" columns={MERGE_TRAIN_COLUMNS} columnWidths={MERGE_TRAIN_COLUMN_WIDTHS} rows={rows} rowHeight="compact" />;
}

function EntityConcurrency({ facts }: { readonly facts: LivePipelineFacts }) {
  const rows = EntityWorkModel.concurrencyRowsOf(facts).map((row) => ({
    key:   row.key,
    cells: {
      entity:  <MonoId text={row.entityKey} tone="strong" weight="medium" />,
      cap:     <Text>{row.capText}</Text>,
      running: <Text>{row.runningText}</Text>,
      waiting: (
        <Row centerY gap="six" wrap>
          {row.atCap ? <Tag text="At its cap" tone="warn" /> : null}
          {row.waitingTickets.length === 0
            ? <Text typeRole="small" subtle>None</Text>
            : row.waitingTickets.map((chip) => <Tag key={chip.key} text={chip.text} {...StateToneUtil.tagLookOf(chip.state)} href={chip.href} />)}
        </Row>
      ),
    } satisfies Record<EntityConcurrencyColumn, ReactNode>,
  }));
  if (rows.length === 0) return null;
  return (
    <DataTable
      label="Jobs by entity"
      columns={ENTITY_CONCURRENCY_COLUMNS}
      columnWidths={ENTITY_CONCURRENCY_COLUMN_WIDTHS}
      rows={rows}
      rowHeight="compact"
    />
  );
}

export function ForgeLevelLive({ facts, selection, now }: ForgeLevelLiveProps) {
  const flow = facts.pipelineFlow ?? null;
  const livePipeline = facts.pipeline?.readingVerdict === 'readable' ? facts.pipeline.pipeline : null;
  const ticketNode = flow?.nodes.find((node) => node.nodeKind === 'ticket-creation') ?? null;
  const approvals = ForgeLevelPageModel.approvalViewsOf(livePipeline);
  return (
    <div className="bridge-forge-level">
      <section className="bridge-forge-level-section" aria-label="Ticket phase">
        <PhaseKicker phase="ticket" text="Ticket phase · every entity" />
        <Text typeRole="section" element="h3">Tickets</Text>
        {flow === null || ticketNode === null
          ? null
          : (
            <div className="bridge-forge-level-step">
              <StepCard
                view={PipelineFlowModel.nodeViewOf(ticketNode, facts.pipelineChoices?.efforts ?? [])}
                occupants={FlowActivityPanelModel.occupantChipsOf(flow, ticketNode.nodeId)}
                questionCount={0}
                selected={false}
                editable={false}
                onOpen={selection.open}
                onEdits={() => undefined}
              />
            </div>
          )}
        <EntityAssignmentLine assignment={facts.entityAssignment} />
        {approvals.map((approval) => (
          <View key={approval.approval}>
            <Text bold>{`${approval.title}: ${approval.isOn ? 'on' : 'off'}`}</Text>
            <Text typeRole="tab" muted>{approval.hint}</Text>
          </View>
        ))}
      </section>
      <section className="bridge-forge-level-section" aria-label="Merge train">
        <PhaseKicker phase="merge" text="Merge phase · every entity, in order" />
        <Text typeRole="section" element="h3">Merge train</Text>
        {flow === null ? null : <MergeTrain facts={facts} flow={flow} now={now} />}
      </section>
      {facts.concurrency === undefined
        ? null
        : (
          <section className="bridge-forge-level-section" aria-label="Concurrency">
            <Text typeRole="lead" bold element="h3">Concurrency</Text>
            <Row centerY gap="ten" wrap>
              <Text muted>Build and review jobs at a time, over every entity.</Text>
              <Text bold>{`Board: ${ForgeLevelLiveModel.boardJobsTextOf(facts.concurrency)}`}</Text>
            </Row>
            <EntityConcurrency facts={facts} />
          </section>
        )}
      <section className="bridge-forge-level-no-gates" aria-label="Gates">
        <Text bold>{NO_GATES_TITLE}</Text>
        <Text muted>{NO_GATES_TEXT}</Text>
      </section>
    </div>
  );
}
