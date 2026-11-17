/**
 * The forge level of a live monorepo pipeline (MonoLive), in place of the phases: what every entity shares, as it runs now. The Ticket
 * phase holds the product owner's step with the drafts it writes and the two approvals as they are applied; the merge train lists the
 * ticket in the Airlock and the queue behind it; the board's jobs in flight stand against its limit; and a note says that gates belong to
 * an entity. Nothing here changes the pipeline: an update does that.
 */
import { DataTable }      from 'design-system/DataTable';
import { MonoId }         from 'design-system/MonoId';
import { Row }            from 'design-system/Row';
import { Text }           from 'design-system/Text';
import { View }           from 'design-system/View';
import type { ReactNode } from 'react';

import type { PipelineFlowFacts } from '../../../../src/lib/tracker-model/@types/PipelineFacts.ts';
import { ForgeLevelPageModel }    from '../entities/ForgeLevelPageModel.ts';
import type { FlowSelection }     from '../flow/FlowSelection.ts';
import { PipelineFlowModel }      from '../flow/PipelineFlowModel.ts';
import { StepCard }               from '../flow/StepCard.tsx';
import { FlowActivityPanelModel } from './FlowActivityPanelModel.ts';
import { ForgeLevelLiveModel }    from './ForgeLevelLiveModel.ts';
import type { LivePipelineFacts } from './LivePipelineModel.ts';

type MergeTrainColumn = 'position' | 'ticket' | 'state' | 'waiting';

export interface ForgeLevelLiveProps {
  /** The forge's own facts: its flow, with every entity's tickets on it, and the applied pipeline. */
  readonly facts:     LivePipelineFacts;
  readonly selection: FlowSelection;
  readonly now:       Date;
}

const MERGE_TRAIN_COLUMNS = [
  { key: 'position', label: 'Place', labelHidden: true },
  { key: 'ticket', label: 'Ticket' },
  { key: 'state', label: 'State' },
  { key: 'waiting', label: 'Waiting', align: 'end' },
] as const;

const MERGE_TRAIN_COLUMN_WIDTHS = '32px minmax(0, 0.8fr) minmax(0, 2fr) minmax(0, 0.6fr)';

const NO_GATES_TITLE = 'No gates at the Forge level.';

const NO_GATES_TEXT = 'A gate always belongs to an entity: its builder, reviewer and Airlock run it. Pick an entity on the left to see its gates.';

function MergeTrain({ flow, now }: { readonly flow: PipelineFlowFacts; readonly now: Date }) {
  const rows = ForgeLevelLiveModel.mergeTrainRowsOf(flow, now).map((row) => ({
    key:   row.key,
    cells: {
      position: <Text typeRole="small" subtle mono>{row.positionText}</Text>,
      ticket:   <a href={row.href} aria-label={`Open ticket ${row.ticketId}`}><MonoId text={row.ticketId} tone="link" weight="medium" /></a>,
      state:    <Text bold={row.inAirlock} muted={!row.inAirlock}>{row.stateText}</Text>,
      waiting:  <Text typeRole="small" subtle>{row.waitingText}</Text>,
    } satisfies Record<MergeTrainColumn, ReactNode>,
  }));
  if (rows.length === 0) return <Text muted element="p">No ticket is in the merge train now.</Text>;
  return <DataTable label="Merge train" columns={MERGE_TRAIN_COLUMNS} columnWidths={MERGE_TRAIN_COLUMN_WIDTHS} rows={rows} rowHeight="compact" />;
}

export function ForgeLevelLive({ facts, selection, now }: ForgeLevelLiveProps) {
  const flow = facts.pipelineFlow ?? null;
  const livePipeline = facts.pipeline?.readingVerdict === 'readable' ? facts.pipeline.pipeline : null;
  const ticketNode = flow?.nodes.find((node) => node.nodeKind === 'ticket-creation') ?? null;
  const approvals = ForgeLevelPageModel.approvalViewsOf(livePipeline);
  return (
    <div className="bridge-forge-level">
      <section className="bridge-forge-level-section" aria-label="Ticket phase">
        <Text typeRole="small" muted>Ticket phase · every entity</Text>
        <Text typeRole="lead" bold element="h3">Tickets</Text>
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
        {approvals.map((approval) => (
          <View key={approval.approval}>
            <Text bold>{`${approval.title}: ${approval.isOn ? 'on' : 'off'}`}</Text>
            <Text typeRole="tab" muted>{approval.hint}</Text>
          </View>
        ))}
      </section>
      <section className="bridge-forge-level-section" aria-label="Merge train">
        <Text typeRole="small" muted>Merge phase · every entity, in order</Text>
        <Text typeRole="lead" bold element="h3">Merge train</Text>
        {flow === null ? null : <MergeTrain flow={flow} now={now} />}
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
          </section>
        )}
      <section className="bridge-forge-level-no-gates" aria-label="Gates">
        <Text bold>{NO_GATES_TITLE}</Text>
        <Text muted>{NO_GATES_TEXT}</Text>
      </section>
    </div>
  );
}
