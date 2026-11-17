/**
 * The copy between entities (MonoCopyGates): the entity to copy from, the entities to copy to with each one's kind and gates, what to copy
 * (gates with their phases, prepare steps, agent settings), a preview line for each target the copy changes, and Copy, which sends the set
 * as one copy and closes once the Overseer applied it. With no target or nothing to copy, the foot says what to pick.
 */
import { Button }           from 'design-system/Button';
import { Checkbox }         from 'design-system/Checkbox';
import { Dialog }           from 'design-system/Dialog';
import { SegmentedControl } from 'design-system/SegmentedControl';
import { Text }             from 'design-system/Text';
import { View }             from 'design-system/View';
import { useState }         from 'react';

import type { EntityKey, Pipeline }                                      from '../../../../src/lib/tracker-model/@types/Pipeline.ts';
import { CommandButton }                                                 from '../../../shell/CommandButton.tsx';
import type { DraftEditTarget }                                          from '../flow/PipelineFlowModel.ts';
import { COPIED_PARTS, CopyBetweenEntitiesDialogModel, type CopiedPart } from './CopyBetweenEntitiesDialogModel.ts';

export interface CopyBetweenEntitiesDialogProps {
  readonly wholeDraft:    Pipeline;
  /** The entity the dialog opens on as the source. */
  readonly fromEntityKey: EntityKey;
  readonly target:        DraftEditTarget;
  readonly onClose:       () => void;
}

const DESCRIPTION = 'Sibling entities often start alike. A copy becomes ordinary edits in the draft, shown as one set in Changes; each edit undoes alone.';

const NOTHING_PICKED_TEXT = 'Pick at least one entity and one thing to copy.';

const NOTHING_CHANGES_TEXT = 'The entities you picked already have these settings.';

const PART_WORDS: Readonly<Record<CopiedPart, { readonly label: string; readonly explanation: string }>> = Object.freeze({
  'gates':          { label: 'Gates', explanation: 'With their phases' },
  'prepare-steps':  { label: 'Prepare steps', explanation: 'Each step at the end of the target’s steps' },
  'agent-settings': { label: 'Agent settings', explanation: 'Model and effort of the builder, reviewer and both re-reviewers' },
});

export function CopyBetweenEntitiesDialog({
  wholeDraft, fromEntityKey, target, onClose
}: CopyBetweenEntitiesDialogProps) {
  const [sourceKey, setSourceKey] = useState(fromEntityKey);
  const [chosenKeys, setChosenKeys] = useState<readonly EntityKey[]>([]);
  const [parts, setParts] = useState<readonly CopiedPart[]>(['gates']);
  const request = { fromEntityKey: sourceKey, toEntityKeys: chosenKeys.filter((key) => key !== sourceKey), parts };
  const edits = CopyBetweenEntitiesDialogModel.copyEditsOf(wholeDraft, request);
  const previewLines = CopyBetweenEntitiesDialogModel.previewLinesOf(wholeDraft, request);
  const nothingPicked = request.toEntityKeys.length === 0 || parts.length === 0;
  const footNote = nothingPicked ? NOTHING_PICKED_TEXT : edits.length === 0 ? NOTHING_CHANGES_TEXT : null;
  const chooseTarget = (entityKey: EntityKey, checked: boolean): void => {
    setChosenKeys(checked ? [...chosenKeys, entityKey] : chosenKeys.filter((chosenKey) => chosenKey !== entityKey));
  };
  const choosePart = (part: CopiedPart, checked: boolean): void => {
    setParts(checked ? COPIED_PARTS.filter((candidate) => candidate === part || parts.includes(candidate)) : parts.filter((chosen) => chosen !== part));
  };
  return (
    <Dialog
      title="Copy settings between entities"
      description={DESCRIPTION}
      isOpen
      onDismiss={onClose}
      closeLabel="Close"
      width="wide"
      foot={(
        <span className="bridge-pipeline-copy-dialog-foot">
          {footNote === null ? null : <Text muted>{footNote}</Text>}
          <Button label="Cancel" onPress={onClose} />
          <CommandButton
            primary
            label={CopyBetweenEntitiesDialogModel.copyLabelOf(edits.length)}
            command={CopyBetweenEntitiesDialogModel.copyCommandOf(target, edits)}
            onApplied={onClose}
          />
        </span>
      )}
    >
      <View gap="eighteen">
        <View gap="eight">
          <Text bold>From</Text>
          <SegmentedControl
            accessibleName="Copy from"
            mono
            options={Object.keys(wholeDraft.entities ?? {}).map((entityKey) => ({ value: entityKey, label: entityKey }))}
            selected={sourceKey}
            onSelect={setSourceKey}
          />
        </View>
        <View gap="eight">
          <Text bold>To</Text>
          {CopyBetweenEntitiesDialogModel.targetOptionsOf(wholeDraft, sourceKey).map((option) => (
            <Checkbox
              key={option.entityKey}
              label={option.entityKey}
              explanation={option.explanation}
              checked={chosenKeys.includes(option.entityKey)}
              onChange={(checked) => chooseTarget(option.entityKey, checked)}
            />
          ))}
        </View>
        <View gap="eight">
          <Text bold>What to copy</Text>
          {COPIED_PARTS.map((part) => (
            <Checkbox
              key={part}
              label={PART_WORDS[part].label}
              explanation={PART_WORDS[part].explanation}
              checked={parts.includes(part)}
              onChange={(checked) => choosePart(part, checked)}
            />
          ))}
        </View>
        {previewLines.length === 0
          ? null
          : (
            <section className="bridge-pipeline-copy-dialog-preview" aria-label="Preview">
              {previewLines.map((line) => (
                <p key={line.entityKey} className="bridge-pipeline-copy-dialog-preview-line">
                  <Text bold>{line.lead}</Text>
                  <Text muted>{line.rest}</Text>
                </p>
              ))}
            </section>
          )}
      </View>
    </Dialog>
  );
}
