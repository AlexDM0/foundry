/**
 * MonoEntitiesFold: folding a package into the root or an app. User picks the target; the dialog says what the package becomes, the trade
 * (a border costs stages on every ticket that crosses it, a fold removes the border and the package follows the target's gates and
 * constitution), and the target's home folders before and after. Fold sends the fold as one gesture; nothing is stored until Apply.
 */
import { Button }   from 'design-system/Button';
import { Callout }  from 'design-system/Callout';
import { Dialog }   from 'design-system/Dialog';
import { Text }     from 'design-system/Text';
import { View }     from 'design-system/View';
import { useState } from 'react';

import type { EntityKey }         from '../../../../src/lib/tracker-model/@types/Pipeline.ts';
import type { PipelineDraftEdit } from '../../../../src/lib/tracker-model/@types/PipelineSetup.ts';
import type { PipelineEntities }  from '../../../../src/lib/tracker-model/utils/EntityOwnershipUtil.ts';
import { CompactSelect }          from './CompactSelect.tsx';
import { FoldEntityDialogModel }  from './FoldEntityDialogModel.ts';

export interface FoldEntityDialogProps {
  readonly packageKey: EntityKey;
  readonly entities:   PipelineEntities;
  readonly onFold:     (edits: readonly PipelineDraftEdit[]) => void;
  readonly onClose:    () => void;
}

function FolderList({ label, folders }: { readonly label: string; readonly folders: readonly string[] }) {
  return (
    <View gap="four">
      <Text typeRole="micro" subtle>{label}</Text>
      <ul className="bridge-fold-folders" aria-label={label}>
        {folders.map((folder) => <li key={folder} className="bridge-fold-folder">{folder}</li>)}
      </ul>
    </View>
  );
}

export function FoldEntityDialog({
  packageKey, entities, onFold, onClose
}: FoldEntityDialogProps) {
  const targets = FoldEntityDialogModel.targetsOf(entities);
  const [targetKey, setTargetKey] = useState(targets[0] ?? '');
  const words = FoldEntityDialogModel.wordsOf(entities, packageKey, targetKey);
  const folders = FoldEntityDialogModel.foldersOf(entities, packageKey, targetKey);
  return (
    <Dialog
      title={words.title}
      description={words.lead}
      isOpen
      onDismiss={onClose}
      closeLabel="Cancel"
      width="standard"
      foot={(
        <>
          <Button label="Cancel" emphasis="ghost" onPress={onClose} />
          <Button
            label={`Fold into ${targetKey}`}
            emphasis="primary"
            onPress={() => {
              onFold(FoldEntityDialogModel.foldEditsOf(entities, packageKey, targetKey));
              onClose();
            }}
          />
        </>
      )}
    >
      <View gap="fourteen">
        <span className="bridge-fold-target">
          <Text typeRole="small" bold>Fold into</Text>
          <CompactSelect
            accessibleName="Fold into"
            value={targetKey}
            options={targets.map((key) => ({ value: key, label: key }))}
            onChange={setTargetKey}
          />
          <Text typeRole="small" muted>{words.targetHint}</Text>
        </span>
        <Callout tone="neutral" title="The trade" titleElement="h3">
          <Text element="p">
            {`A border costs stages on every ticket that crosses it; folding removes the border, and ${packageKey} follows ${targetKey}'s gates and constitution.`}
          </Text>
          <Text element="p" muted>{words.tradeDetail}</Text>
        </Callout>
        <div className="bridge-fold-before-after">
          <FolderList label={`${targetKey} before`} folders={folders.before} />
          <FolderList label={`${targetKey} after`} folders={folders.after} />
        </div>
        <Text typeRole="small" muted element="p">{`Nothing is stored until you apply. You can add ${packageKey} back as a package later.`}</Text>
      </View>
    </Dialog>
  );
}
