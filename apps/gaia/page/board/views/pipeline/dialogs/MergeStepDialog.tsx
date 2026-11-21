/**
 * The merge step dialog (A3dMergeModal), for a merge of main into the tree after the review and the re-review that follows it. Nothing on
 * the merge itself is set: its derived meter, focusable with its tooltip, says whose model and effort fix its conflicts. Its one setting is
 * the conditional re-review after a conflict merge; Save sends the merge train's `reReview` and, while on, the conflict re-reviewer. In
 * monorepo mode the forge's dialog is the Airlock's and sets only the switch and threshold, and an entity's sets only its own conflict
 * re-reviewer, linking the forge for the rest.
 */

import { useRef, useState }                                                                          from 'react';
import type { BoardLimitsDocument }                                                                  from '../../../../@types/board/BoardFactDocuments.ts';
import type { BoardFlowNodeDocument, BoardPipelineChoicesDocument, BoardPipelineDefinitionDocument } from '../../../../@types/board/BoardPipelineDocuments.ts';
import {
  Button,
  Card,
  Dialog,
  ModelEffortMeter,
  Row,
  Text,
  View
} from '../../../../lib/design-system/DesignSystemInterface.ts';
import type { PipelineFlowEditSender } from '../flow/PipelineFlowEditSender.ts';
import { PipelineFlowModel }           from '../flow/PipelineFlowModel.ts';

import type { ConstitutionPlace }                                           from './InstructionsEditorModel.ts';
import { MergeStepDialogModel }                                             from './MergeStepDialogModel.ts';
import { RereviewSettings }                                                 from './RereviewSettings.tsx';
import { RereviewSettingsModel, type ReReviewForm, type ReReviewLevelPart } from './RereviewSettingsModel.ts';
import { StepDialogFoot }                                                   from './StepDialogFoot.tsx';

export interface MergeStepDialogProps {
  /** The merge node the dialog is about; opened from a re-review node, the merge before it. */
  readonly mergeNode:       BoardFlowNodeDocument;
  /** The conflict re-review node, absent while the re-review is off. */
  readonly reReviewNode:    BoardFlowNodeDocument | null;
  readonly draft:           BoardPipelineDefinitionDocument | null;
  readonly choices:         BoardPipelineChoicesDocument;
  /** The forge's defaults a Reset puts back and a new re-review starts at, and the rework threshold a node names. */
  readonly limits:          BoardLimitsDocument;
  readonly constitution:    ConstitutionPlace;
  readonly focusesReReview: boolean;
  readonly editSender:      PipelineFlowEditSender;
  readonly onClose:         () => void;
  /** Which part a monorepo level sets; absent sets the whole step. */
  readonly levelPart?:      ReReviewLevelPart;
  /** Where the forge sets the merge train's re-review, linked from an entity's dialog. */
  readonly forgeLevelHref?: string;
}

const AIRLOCK_TITLE = 'The Airlock';

const AIRLOCK_DESCRIPTION = 'Lets one ticket onto main at a time, by fast-forward, after the entity’s merge gates. These settings apply to every entity.';

export function MergeStepDialog({
  mergeNode, reReviewNode, draft, choices, limits, constitution, focusesReReview, editSender, onClose, levelPart = 'whole', forgeLevelHref
}: MergeStepDialogProps) {
  const [reReviewForm, setReReviewForm] = useState<ReReviewForm>(
    () => RereviewSettingsModel.formOf('merge', draft?.airlock?.reReview, draft, reReviewNode?.settings ?? null, limits),
  );
  const reReviewSwitch = useRef<HTMLElement | null>(null);
  const head = MergeStepDialogModel.headOf(mergeNode.mergePlacement);
  const saveEdits = MergeStepDialogModel.saveEditsOf(reReviewForm, levelPart);
  const { meter } = PipelineFlowModel.nodeViewOf(mergeNode, { efforts: choices.efforts, reworkThresholdLines: limits.reworkRoundThresholdLines });
  return (
    <Dialog
      title={levelPart === 'merge-train' ? AIRLOCK_TITLE : head.title}
      kicker={head.kicker}
      description={levelPart === 'merge-train' ? AIRLOCK_DESCRIPTION : head.description}
      isOpen
      onDismiss={onClose}
      closeLabel="Close"
      width="widest"
      {...(focusesReReview ? { initialFocus: reReviewSwitch } : {})}
      foot={(
        <StepDialogFoot
          start={<Button label="Reset to default" emphasis="ghost" onPress={() => setReReviewForm(RereviewSettingsModel.resetFormOf('merge', limits))} />}
          saveLabel="Save"
          canSave={editSender.enabled && saveEdits.length > 0}
          refusal={editSender.refusal}
          onCancel={onClose}
          onSave={() => editSender.sendEdits(saveEdits)}
        />
      )}
    >
      <View gap="sixteen">
        {levelPart === 'merge-train'
          ? null
          : (
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
          )}
        <RereviewSettings
          place="merge"
          form={reReviewForm}
          thresholdStepLines={RereviewSettingsModel.thresholdStepLinesOf(limits)}
          choices={choices}
          resolvedEntries={reReviewNode?.instructionEntries ?? []}
          constitution={constitution}
          onChange={setReReviewForm}
          switchRef={reReviewSwitch}
          levelPart={levelPart}
          {...(forgeLevelHref === undefined ? {} : { forgeLevelHref })}
        />
      </View>
    </Dialog>
  );
}
