/**
 * The agent step dialog (A3Inspector) of Ticket creation, the Spec and Plan writing steps and the Builder: the model beside the effort,
 * every value the board offers, the meter in the head following the form, the brief, in the spec-then-plan route the builder's pipeline
 * documents, when the step runs and what it fixes, and the foot. The form is local until Save, which sends the role's one edit; Reset to
 * default fills the form with the defaults and sends nothing; Esc, × and Cancel send nothing. At the forge level of a monorepo, the
 * product owner's dialog says it also names each ticket's entity.
 */

import { useState }                                                                                  from 'react';
import type { BoardLimitsDocument }                                                                  from '../../../../@types/board/BoardFactDocuments.ts';
import type { BoardFlowNodeDocument, BoardPipelineChoicesDocument, BoardPipelineDefinitionDocument } from '../../../../@types/board/BoardPipelineDocuments.ts';
import {
  Button,
  Card,
  Dialog,
  ModelEffortMeter,
  View
} from '../../../../lib/design-system/DesignSystemInterface.ts';
import type { PipelineFlowEditSender } from '../flow/PipelineFlowEditSender.ts';
import { PipelineFlowModel }           from '../flow/PipelineFlowModel.ts';

import { AgentStepDialogModel, type AgentStepForm, type AgentStepRole } from './AgentStepDialogModel.ts';
import { InstructionsEditor }                                           from './InstructionsEditor.tsx';
import type { ConstitutionPlace }                                       from './InstructionsEditorModel.ts';
import { ModelEffortFields }                                            from './ModelEffortFields.tsx';
import { PipelineDocumentsSection }                                     from './PipelineDocumentsSection.tsx';
import { StepDialogFoot }                                               from './StepDialogFoot.tsx';
import { StepFact }                                                     from './StepFact.tsx';

/** Sends a question to the pipeline agent, opening an advise session first where none runs. */
export interface PipelineAgentAsker {
  readonly enabled: boolean;
  readonly refusal: string | null;
  readonly ask:     (question: string) => void;
}

export interface AgentStepDialogProps {
  readonly role:          AgentStepRole;
  readonly node:          BoardFlowNodeDocument;
  readonly draft:         BoardPipelineDefinitionDocument | null;
  readonly choices:       BoardPipelineChoicesDocument;
  /** The forge's defaults a Reset puts back. */
  readonly limits:        BoardLimitsDocument;
  readonly constitution:  ConstitutionPlace;
  readonly editSender:    PipelineFlowEditSender;
  readonly asker:         PipelineAgentAsker;
  readonly onClose:       () => void;
  /** The forge holds entities, so the product owner also routes each ticket to one. */
  readonly overEntities?: boolean;
}

export function AgentStepDialog({
  role, node, draft, choices, limits, constitution, editSender, asker, onClose, overEntities = false
}: AgentStepDialogProps) {
  const [form, setForm] = useState<AgentStepForm>(() => AgentStepDialogModel.formOf(role, draft, node.settings, limits));
  const words = AgentStepDialogModel.wordsOf(role, overEntities);
  const meter = (
    <ModelEffortMeter
      model={form.model}
      effort={form.effort}
      level={AgentStepDialogModel.levelOf(form.effort, choices.efforts)}
      levelCount={choices.efforts.length}
      accessibleName={AgentStepDialogModel.meterNameOf(words.title, form)}
      size="dialog"
    />
  );
  return (
    <Dialog
      title={words.title}
      kicker={AgentStepDialogModel.kickerOf(role)}
      headEnd={meter}
      description={words.description}
      isOpen
      onDismiss={onClose}
      closeLabel="Close"
      width="widest"
      foot={(
        <StepDialogFoot
          start={(
            <>
              <Button label="Ask the pipeline agent" disabled={!asker.enabled} onPress={() => asker.ask(AgentStepDialogModel.questionOf(words.title))} />
              <Button label="Reset to default" emphasis="ghost" onPress={() => setForm(AgentStepDialogModel.resetFormOf(role, limits))} />
            </>
          )}
          saveLabel="Save"
          canSave={editSender.enabled}
          refusal={editSender.refusal ?? asker.refusal}
          onCancel={onClose}
          onSave={() => editSender.sendEdits([AgentStepDialogModel.roleEditOf(role, form)])}
        />
      )}
    >
      <View gap="eighteen">
        <ModelEffortFields
          models={choices.models}
          efforts={choices.efforts}
          model={form.model}
          effort={form.effort}
          modelLabel="Model"
          effortLabel="Effort"
          effortHint={AgentStepDialogModel.effortHintOf(form.effort)}
          size="standard"
          onModel={(model) => setForm({ ...form, model })}
          onEffort={(effort) => setForm({ ...form, effort })}
        />
        <InstructionsEditor
          label="Brief"
          role={role}
          entries={form.entries}
          resolvedEntries={node.instructionEntries}
          constitution={constitution}
          onChange={(entries) => setForm({ ...form, entries })}
        />
        {role !== 'builder' || form.documents === null || PipelineFlowModel.ticketWritingRouteOfDraft(draft) !== 'spec-then-plan'
          ? null
          : <PipelineDocumentsSection role="builder" rules={form.documents} onChange={(documents) => setForm({ ...form, documents })} />}
        <Card step paddingVertical="four" paddingHorizontal="fourteen" divider>
          <StepFact term="Runs" description={words.runs} />
          {words.fixes === null ? null : <StepFact term="Fixes" description={words.fixes} />}
        </Card>
      </View>
    </Dialog>
  );
}
