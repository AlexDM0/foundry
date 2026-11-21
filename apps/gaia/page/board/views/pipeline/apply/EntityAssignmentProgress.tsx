/**
 * MonoAssignTickets, read-only: the product owner that the first Apply over entities started, giving each committed ticket an entity. The
 * dialog lists each ticket with its title, the product owner's reason and the entity, or that it waits; Close is its one action. The
 * forge level's line counts the progress and opens the dialog.
 */
import { Button }                                                      from 'design-system/Button';
import { DataTable }                                                   from 'design-system/DataTable';
import { Dialog }                                                      from 'design-system/Dialog';
import { MonoId }                                                      from 'design-system/MonoId';
import { Row }                                                         from 'design-system/Row';
import { Tag }                                                         from 'design-system/Tag';
import { Text }                                                        from 'design-system/Text';
import { View }                                                        from 'design-system/View';
import { useState }                                                    from 'react';
import type { ReactNode }                                              from 'react';
import type { BoardEntityAssignmentDocument }                          from '../../../../@types/board/BoardPipelineDocuments.ts';
import { useBoardHrefOf }                                              from '../../../shell/BoardRouteLinks.ts';
import { EntityAssignmentProgressModel, type EntityAssignmentRowView } from './EntityAssignmentProgressModel.ts';

type AssignmentColumn = 'ticket' | 'title' | 'entity';

const ASSIGNMENT_COLUMNS = [
  { key: 'ticket', label: 'Ticket' },
  { key: 'title', label: 'Title and the product owner’s reason' },
  { key: 'entity', label: 'Entity', align: 'end' },
] as const;

const ASSIGNMENT_COLUMN_WIDTHS = 'minmax(0, 0.5fr) minmax(0, 2.4fr) minmax(0, 0.8fr)';

function EntityCell({ row }: { readonly row: EntityAssignmentRowView }) {
  if (row.state === 'assigned') return <Tag text={row.entityText} tone="neutral" glyph="check" />;
  if (row.state === 'waiting') return <Tag text={row.entityText} tone="neutral" dashed />;
  return <Tag text={row.entityText} tone="warn" glyph="warning" />;
}

export interface EntityAssignmentProgressProps {
  readonly assignment: BoardEntityAssignmentDocument;
  readonly onClose:    () => void;
}

export function EntityAssignmentProgress({ assignment, onClose }: EntityAssignmentProgressProps) {
  const hrefOf = useBoardHrefOf();
  const view = EntityAssignmentProgressModel.viewOf(assignment);
  const rows = view.rows.map((row) => ({
    key:   row.ticketId,
    cells: {
      ticket: <a href={hrefOf(row.ticketRoute)} aria-label={`Open ticket ${row.ticketId}`}><MonoId text={row.ticketId} tone="link" weight="medium" /></a>,
      title:  (
        <View gap="two">
          <Text bold>{row.title}</Text>
          <Text typeRole="small" muted>{row.reason}</Text>
        </View>
      ),
      entity: <EntityCell row={row} />,
    } satisfies Record<AssignmentColumn, ReactNode>,
  }));
  return (
    <Dialog
      title={view.title}
      kicker={view.stateText}
      description={view.lead}
      isOpen
      onDismiss={onClose}
      closeLabel="Close"
      width="widest"
      foot={(
        <div className="board-pipeline-dialog-foot-row">
          <Text muted>Nothing to do here: this shows what the product owner did.</Text>
          <span className="board-pipeline-dialog-foot-gap" />
          <Button label="Close" onPress={onClose} />
        </div>
      )}
    >
      <View gap="twelve">
        <DataTable label="Tickets the product owner gives an entity" columns={ASSIGNMENT_COLUMNS} columnWidths={ASSIGNMENT_COLUMN_WIDTHS} rows={rows} rowHeight="tall" />
        <div role="status">
          <Text element="p">
            <Text bold>{view.summary}</Text>
            {' '}
            <Text muted>{view.note}</Text>
          </Text>
        </div>
      </View>
    </Dialog>
  );
}

/** The forge level's line while the product owner assigns entities, with the button that opens its progress. */
export function EntityAssignmentLine({ assignment }: { readonly assignment: BoardEntityAssignmentDocument | null }) {
  const [progressIsOpen, setProgressIsOpen] = useState(false);
  if (!EntityAssignmentProgressModel.lineIsShownFor(assignment)) return null;
  return (
    <Row centerY gap="ten" wrap>
      {assignment.jobState === null ? null : <Tag text="Assigning" tone="neutral" busy />}
      <Text>{EntityAssignmentProgressModel.lineTextOf(assignment)}</Text>
      <Button label="Show the assignments" expanded={progressIsOpen} onPress={() => setProgressIsOpen(true)} />
      {progressIsOpen ? <EntityAssignmentProgress assignment={assignment} onClose={() => setProgressIsOpen(false)} /> : null}
    </Row>
  );
}
