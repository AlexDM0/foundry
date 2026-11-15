/**
 * The merge step dialog (A3dMergeModal), for a merge of main into the tree after the review and the re-review that follows it. Nothing on
 * the merge itself is set: its derived meter, focusable with its tooltip, says whose model and effort fix its conflicts. Its one setting is
 * the conditional re-review after a conflict merge; Save sends the merge train's `reReview` and, while on, the conflict re-reviewer.
 */

import { Button }           from 'design-system/Button';
import { Card }             from 'design-system/Card';
import { Dialog }           from 'design-system/Dialog';
import { ModelEffortMeter } from 'design-system/ModelEffortMeter';
import { Row }              from 'design-system/Row';
import { Text }             from 'design-system/Text';
import { View }             from 'design-system/View';
import { useRef, useState } from 'react';

import type { Pipeline }                          from '../../../../src/lib/tracker-model/@types/Pipeline.ts';
import type { PipelineChoices, PipelineFlowNode } from '../../../../src/lib/tracker-model/@types/PipelineFacts.ts';
import type { PipelineFlowEditSender }            from '../flow/PipelineFlowEditSender.ts';
import { PipelineFlowModel }                      from '../flow/PipelineFlowModel.ts';

import type { ConstitutionPlace }                   from './InstructionsEditorModel.ts';
import { MergeStepDialogModel }                     from './MergeStepDialogModel.ts';
import { RereviewSettings }                         from './RereviewSettings.tsx';
import { RereviewSettingsModel, type ReReviewForm } from './RereviewSettingsModel.ts';
import { StepDialogFoot }                           from './StepDialogFoot.tsx';

export interface MergeStepDialogProps {
  /** The merge node the dialog is about; opened from a re-review node, the merge before it. */
  readonly mergeNode:       PipelineFlowNode;
  /** The conflict re-review node, absent while the re-review is off. */
  readonly reReviewNode:    PipelineFlowNode | null;
  readonly draft:           Pipeline | null;
  readonly choices:         PipelineChoices;
  readonly constitution:    ConstitutionPlace;
  readonly focusesReReview: boolean;
  readonly editSender:      PipelineFlowEditSender;
  readonly onClose:         () => void;
}

export function MergeStepDialog({
  mergeNode, reReviewNode, draft, choices, constitution, focusesReReview, editSender, onClose
}: MergeStepDialogProps) {
  const [reReviewForm, setReReviewForm] = useState<ReReviewForm>(
    () => RereviewSettingsModel.formOf('merge', draft?.airlock?.reReview, draft, reReviewNode?.settings ?? null),
  );
  const reReviewSwitch = useRef<HTMLElement | null>(null);
  const head = MergeStepDialogModel.headOf(mergeNode.mergePlacement);
  const { meter } = PipelineFlowModel.nodeViewOf(mergeNode, choices.efforts);
  return (
    <Dialog
      title={head.title}
      kicker={head.kicker}
      description={head.description}
      isOpen
      onDismiss={onClose}
      closeLabel="Close"
      width="widest"
      {...(focusesReReview ? { initialFocus: reReviewSwitch } : {})}
      foot={(
        <StepDialogFoot
          start={<Button label="Reset to default" emphasis="ghost" onPress={() => setReReviewForm(RereviewSettingsModel.resetFormOf('merge'))} />}
          saveLabel="Save"
          canSave={editSender.enabled}
          refusal={editSender.refusal}
          onCancel={onClose}
          onSave={() => editSender.sendEdits(MergeStepDialogModel.saveEditsOf(draft?.airlock, reReviewForm))}
        />
      )}
    >
      <View gap="sixteen">
        <Card step padding="fourteen" paddingVertical="twelve" gap="two">
          <Row centerY gap="ten" wrap>
            <Text typeRole="title">{MergeStepDialogModel.CONFLICT_FIXER_TITLE}</Text>
            {meter === null
              ? null
              : (
                <ModelEffortMeter
                  model={meter.model}
                  effort={meter.effort}
                  level={meter.level}
                  levelCount={meter.levelCount}
                  accessibleName={meter.accessibleName}
                  size="node"
                  {...(meter.derivedNote === null ? {} : { derivedNote: meter.derivedNote })}
                />
              )}
          </Row>
          <Text muted>{MergeStepDialogModel.conflictTextOf(mergeNode.derivedFrom)}</Text>
        </Card>
        <RereviewSettings
          place="merge"
          form={reReviewForm}
          choices={choices}
          resolvedEntries={reReviewNode?.instructionEntries ?? []}
          constitution={constitution}
          onChange={setReReviewForm}
          switchRef={reReviewSwitch}
        />
      </View>
    </Dialog>
  );
}
