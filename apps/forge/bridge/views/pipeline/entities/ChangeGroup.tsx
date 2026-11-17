/**
 * One level's part of the Changes list: a head that folds the group, naming the forge or the entity with its count of changes, over one
 * card per change with its own Undo, and one batch card per copy to another entity. A batch card says what the copy did and how many
 * edits it made, undoes the set with one press, and unfolds each edit with its own Undo. The draft has no move of its own that takes a
 * set back, so the caller gives the set's command.
 */
import { ChangeRow }       from 'design-system/ChangeRow';
import { CountBadge }      from 'design-system/CountBadge';
import { Icon }            from 'design-system/Icon';
import { MonoId }          from 'design-system/MonoId';
import { Tag }             from 'design-system/Tag';
import { Text }            from 'design-system/Text';
import { useId, useState } from 'react';

import type { ControlCommandBody }                                      from '../../../api/CommandClient.ts';
import { CommandButton }                                                from '../../../shell/CommandButton.tsx';
import { ChangeListModel, type ChangeRowView }                          from '../apply/ChangeListModel.ts';
import { ChangeGroupModel, type ChangeBatchView, type ChangeGroupView } from './ChangeGroupModel.ts';
import { PipelineLevelModel }                                           from './PipelineLevelModel.ts';

export interface ChangeGroupProps {
  readonly setupId:            string;
  readonly group:              ChangeGroupView;
  /** The command that undoes a whole set; `null` keeps the set's Undo disabled. */
  readonly batchUndoCommandOf: (batch: ChangeBatchView) => ControlCommandBody | null;
}

function ChangeCard({ setupId, row, density }: { readonly setupId: string; readonly row: ChangeRowView; readonly density: 'card' | 'row' }) {
  return (
    <ChangeRow
      change={row.change}
      title={row.title}
      location={row.location}
      density={density}
      {...(row.before === null ? {} : { before: row.before })}
      {...(row.after === null ? {} : { after: row.after })}
      {...(row.note === null ? {} : { note: row.note })}
      {...(row.undoEditId === null
        ? {}
        : {
          actions: (
            <CommandButton
              label="Undo"
              compact
              accessibleName={`Undo the change to ${row.title}`}
              command={ChangeListModel.undoCommandOf(setupId, row.undoEditId)}
            />
          ),
        })}
    />
  );
}

function BatchCard({ setupId, batch, command }: { readonly setupId: string; readonly batch: ChangeBatchView; readonly command: ControlCommandBody | null }) {
  const [isOpen, setIsOpen] = useState(false);
  const editListId = useId();
  return (
    <div className="bridge-change-group-batch">
      <span className="bridge-change-group-batch-head">
        <span className="bridge-change-group-batch-title">
          <Text bold>{batch.title}</Text>
          <Tag text={batch.editCountText} tone="state" stateTone="accent" />
        </span>
        <CommandButton label={batch.undoLabel} compact accessibleName={`${batch.undoLabel}: ${batch.title}`} command={command} />
      </span>
      <button
        type="button"
        className="bridge-change-group-disclosure"
        aria-expanded={isOpen}
        aria-controls={editListId}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="bridge-change-group-chevron"><Icon name="chevron-down" label={null} /></span>
        {ChangeGroupModel.disclosureLabelOf(batch, isOpen)}
      </button>
      {isOpen
        ? (
          <ul id={editListId} className="bridge-change-group-batch-edits" aria-label={batch.title}>
            {batch.rows.map((row) => <li key={row.field}><ChangeCard setupId={setupId} row={row} density="row" /></li>)}
          </ul>
        )
        : null}
    </div>
  );
}

export function ChangeGroup({ setupId, group, batchUndoCommandOf }: ChangeGroupProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const isForge = PipelineLevelModel.isForgeLevel(group.level);
  return (
    <section className="bridge-change-group" aria-label={`${group.name} changes`}>
      <button type="button" className="bridge-change-group-head" aria-label={group.headName} aria-expanded={isExpanded} onClick={() => setIsExpanded(!isExpanded)}>
        <span className="bridge-change-group-chevron"><Icon name="chevron-down" label={null} /></span>
        {isForge ? <Text bold>{group.name}</Text> : <MonoId text={group.name} tone="strong" weight="bold" />}
        <CountBadge count={group.changeCount} tone="plain" />
      </button>
      {isExpanded
        ? (
          <ul className="bridge-change-group-items">
            {group.items.map((item) => (
              <li key={item.itemKind === 'edit' ? item.row.field : item.batch.batchId} className="bridge-change-group-item">
                {item.itemKind === 'edit'
                  ? <ChangeCard setupId={setupId} row={item.row} density="card" />
                  : <BatchCard setupId={setupId} batch={item.batch} command={batchUndoCommandOf(item.batch)} />}
              </li>
            ))}
          </ul>
        )
        : null}
    </section>
  );
}
