/**
 * The review step dialog (A3cReviewModal), in two tabs: Review holds the reviewer's model, effort and brief; Re-review the conditional
 * re-review after the review's fixes. Both tabs edit one form: Save sends the reviewer, the re-reviewer while the re-review is on, and the
 * review with or without its `reReview`. Remove review, after its confirmation, sends the review's removal. Opened from the re-review
 * node, it opens on the Re-review tab with its switch focused.
 */

import { Button }           from 'design-system/Button';
import { ConfirmStrip }     from 'design-system/ConfirmStrip';
import { Dialog }           from 'design-system/Dialog';
import { ModelEffortMeter } from 'design-system/ModelEffortMeter';
import { Tabs }             from 'design-system/Tabs';
import { Text }             from 'design-system/Text';
import { View }             from 'design-system/View';
import { useRef, useState } from 'react';

import type { Pipeline }                          from '../../../../src/lib/tracker-model/@types/Pipeline.ts';
import type { PipelineChoices, PipelineFlowNode } from '../../../../src/lib/tracker-model/@types/PipelineFacts.ts';
import type { PipelineFlowEditSender }            from '../flow/PipelineFlowEditSender.ts';

import { AgentStepDialogModel, type AgentStepForm }  from './AgentStepDialogModel.ts';
import { InstructionsEditor }                        from './InstructionsEditor.tsx';
import type { ConstitutionPlace }                    from './InstructionsEditorModel.ts';
import { ModelEffortFields }                         from './ModelEffortFields.tsx';
import { RereviewSettings }                          from './RereviewSettings.tsx';
import { RereviewSettingsModel, type ReReviewForm }  from './RereviewSettingsModel.ts';
import { ReviewStepDialogModel, type ReviewStepTab } from './ReviewStepDialogModel.ts';
import { StepDialogFoot }                            from './StepDialogFoot.tsx';

export interface ReviewStepDialogProps {
  /** The Review node; its settings and instructions are the reviewer's. */
  readonly reviewNode:      PipelineFlowNode;
  /** The re-review node after the review gates, absent while the re-review is off. */
  readonly reReviewNode:    PipelineFlowNode | null;
  readonly draft:           Pipeline | null;
  readonly choices:         PipelineChoices;
  readonly constitution:    ConstitutionPlace;
  readonly focusesReReview: boolean;
  readonly editSender:      PipelineFlowEditSender;
  readonly onClose:         () => void;
}

export function ReviewStepDialog({
  reviewNode, reReviewNode, draft, choices, constitution, focusesReReview, editSender, onClose
}: ReviewStepDialogProps) {
  const [tab, setTab] = useState<ReviewStepTab>(focusesReReview ? 're-review' : 'review');
  const [reviewerForm, setReviewerForm] = useState<AgentStepForm>(() => AgentStepDialogModel.formOf('reviewer', draft, reviewNode.settings));
  const [reReviewForm, setReReviewForm] = useState<ReReviewForm>(
    () => RereviewSettingsModel.formOf('review', draft?.review?.reReview, draft, reReviewNode?.settings ?? null),
  );
  const [confirmsRemoval, setConfirmsRemoval] = useState(false);
  const reReviewSwitch = useRef<HTMLElement | null>(null);
  const words = ReviewStepDialogModel.WORDS;
  const reset = (): void => {
    setReviewerForm(AgentStepDialogModel.resetFormOf('reviewer'));
    setReReviewForm(RereviewSettingsModel.resetFormOf('review'));
  };
  const removeReview = (): void => editSender.sendEdits(ReviewStepDialogModel.removeEditsOf());
  const removal = confirmsRemoval
    ? (
      <ConfirmStrip
        label={words.removeLabel}
        question={words.removeQuestion}
        consequence={words.removeEffect}
        tone="danger"
        confirm={<Button label={words.removeConfirm} emphasis="danger" disabled={!editSender.enabled} onPress={removeReview} />}
        cancelLabel="Keep review"
        onCancel={() => setConfirmsRemoval(false)}
      />
    )
    : <Button label={words.removeLabel} onPress={() => setConfirmsRemoval(true)} />;
  return (
    <Dialog
      title={words.title}
      kicker={words.kicker}
      headEnd={(
        <ModelEffortMeter
          model={reviewerForm.model}
          effort={reviewerForm.effort}
          level={AgentStepDialogModel.levelOf(reviewerForm.effort, choices.efforts)}
          levelCount={choices.efforts.length}
          accessibleName={AgentStepDialogModel.meterNameOf(words.title, reviewerForm)}
          size="dialog"
        />
      )}
      description={words.description}
      isOpen
      onDismiss={onClose}
      closeLabel="Close"
      width="widest"
      {...(focusesReReview ? { initialFocus: reReviewSwitch } : {})}
      foot={(
        <StepDialogFoot
          start={(
            <>
              {removal}
              <Button label="Reset to default" emphasis="ghost" onPress={reset} />
            </>
          )}
          saveLabel="Save"
          canSave={editSender.enabled}
          refusal={editSender.refusal}
          onCancel={onClose}
          onSave={() => editSender.sendEdits(ReviewStepDialogModel.saveEditsOf(draft?.review, reviewerForm, reReviewForm))}
        />
      )}
    >
      <View gap="eighteen">
        <Tabs
          label={words.tabsLabel}
          items={[{ key: 'review', label: words.reviewTab }, { key: 're-review', label: words.reReviewTab }]}
          selectedKey={tab}
          mode="switch"
          size="section"
          onSelect={setTab}
        />
        {tab === 'review'
          ? (
            <div role="tabpanel" aria-label={words.reviewTab}>
              <View gap="eighteen">
                <ModelEffortFields
                  models={choices.models}
                  efforts={choices.efforts}
                  model={reviewerForm.model}
                  effort={reviewerForm.effort}
                  modelLabel="Model"
                  effortLabel="Effort"
                  effortHint={AgentStepDialogModel.effortHintOf(reviewerForm.effort)}
                  size="standard"
                  onModel={(model) => setReviewerForm({ ...reviewerForm, model })}
                  onEffort={(effort) => setReviewerForm({ ...reviewerForm, effort })}
                />
                <InstructionsEditor
                  label="Brief"
                  role="reviewer"
                  entries={reviewerForm.entries}
                  resolvedEntries={reviewNode.instructionEntries}
                  constitution={constitution}
                  onChange={(entries) => setReviewerForm({ ...reviewerForm, entries })}
                />
              </View>
            </div>
          )
          : (
            <div role="tabpanel" aria-label={words.reReviewTab}>
              <View gap="fourteen">
                <Text typeRole="lead" muted>{words.reReviewLead}</Text>
                <RereviewSettings
                  place="review"
                  form={reReviewForm}
                  choices={choices}
                  resolvedEntries={[...(reReviewNode?.instructionEntries ?? []), ...reviewNode.instructionEntries]}
                  constitution={constitution}
                  onChange={setReReviewForm}
                  switchRef={reReviewSwitch}
                />
              </View>
            </div>
          )}
      </View>
    </Dialog>
  );
}
