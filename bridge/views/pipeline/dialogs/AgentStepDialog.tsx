/**
 * The agent step dialog (A3Inspector) of Ticket creation and the Builder: the model and effort, every value the board offers, the meter
 * in the head following the form, the instruction list, when the step runs and what it fixes, and the foot. The form is local until Save,
 * which sends the role's one edit; Reset to default fills the form with the defaults and sends nothing; Esc, × and Cancel send nothing.
 */
import { useRef, useState } from 'react';

import type { Pipeline }                          from '../../../../src/lib/tracker-model/@types/Pipeline.ts';
import type { PipelineChoices, PipelineFlowNode } from '../../../../src/lib/tracker-model/@types/PipelineFacts.ts';
import { Button }                                 from '../../../design-system/Button.tsx';
import { Dialog }                                 from '../../../design-system/Dialog.tsx';
import { ModelEffortMeter }                       from '../../../design-system/ModelEffortMeter.tsx';
import type { PipelineFlowEditSender }            from '../flow/PipelineFlowEditSender.ts';

import { AgentStepDialogModel, type AgentStepForm, type AgentStepRole } from './AgentStepDialogModel.ts';
import { InstructionsEditor }                                           from './InstructionsEditor.tsx';
import type { ConstitutionPlace }                                       from './InstructionsEditorModel.ts';
import { ModelEffortFields }                                            from './ModelEffortFields.tsx';
import { StepDialogFoot }                                               from './StepDialogFoot.tsx';

/** Sends a question to the pipeline agent, opening an advise session first where none runs. */
export interface PipelineAgentAsker {
  readonly enabled: boolean;
  readonly refusal: string | null;
  readonly ask:     (question: string) => void;
}

export interface AgentStepDialogProps {
  readonly role:         AgentStepRole;
  readonly node:         PipelineFlowNode;
  readonly draft:        Pipeline | null;
  readonly choices:      PipelineChoices;
  readonly constitution: ConstitutionPlace;
  readonly editSender:   PipelineFlowEditSender;
  readonly asker:        PipelineAgentAsker;
  readonly onClose:      () => void;
}

export function AgentStepDialog({
  role, node, draft, choices, constitution, editSender, asker, onClose
}: AgentStepDialogProps) {
  const [form, setForm] = useState<AgentStepForm>(() => AgentStepDialogModel.formOf(role, draft, node.settings));
  const selectedModel = useRef<HTMLButtonElement | null>(null);
  const words = AgentStepDialogModel.wordsOf(role);
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
      kicker={AgentStepDialogModel.AGENT_STEP_KICKER}
      headEnd={meter}
      description={words.description}
      isOpen
      onDismiss={onClose}
      closeLabel="Close"
      width="wide"
      initialFocus={selectedModel}
      foot={(
        <StepDialogFoot
          start={(
            <>
              <Button label="Ask the pipeline agent" disabled={!asker.enabled} onPress={() => asker.ask(AgentStepDialogModel.questionOf(words.title))} />
              <Button label="Reset to default" emphasis="quiet" onPress={() => setForm(AgentStepDialogModel.resetFormOf(role))} />
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
      <div className="bridge-pipeline-dialog-body">
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
          selectedModelRef={selectedModel}
        />
        <InstructionsEditor
          label="Instructions"
          role={role}
          entries={form.entries}
          resolvedEntries={node.instructionEntries}
          constitution={constitution}
          onChange={(entries) => setForm({ ...form, entries })}
        />
        <div className="bridge-pipeline-dialog-info">
          <span>
            <strong>Runs</strong>
            {` ${words.runs}`}
          </span>
          {words.fixes === null
            ? null
            : (
              <span>
                <strong>Fixes</strong>
                {` ${words.fixes}`}
              </span>
            )}
        </div>
      </div>
    </Dialog>
  );
}
