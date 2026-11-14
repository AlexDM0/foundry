/**
 * The agent step dialog (A3Inspector) of Ticket creation and the Builder: the model beside the effort, every value the board offers, the
 * meter in the head following the form, the brief, when the step runs and what it fixes, and the foot. The form is local until Save,
 * which sends the role's one edit; Reset to default fills the form with the defaults and sends nothing; Esc, × and Cancel send nothing.
 */

import { Button }           from 'design-system/Button';
import { Card }             from 'design-system/Card';
import { Dialog }           from 'design-system/Dialog';
import { ModelEffortMeter } from 'design-system/ModelEffortMeter';
import { Row }              from 'design-system/Row';
import { Text }             from 'design-system/Text';
import { View }             from 'design-system/View';
import { useState }         from 'react';

import type { Pipeline }                          from '../../../../src/lib/tracker-model/@types/Pipeline.ts';
import type { PipelineChoices, PipelineFlowNode } from '../../../../src/lib/tracker-model/@types/PipelineFacts.ts';
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

interface StepFactProps {
  readonly term:        string;
  readonly description: string;
}

/** One line of the step's facts: the term in bold, what it says muted beside it. */
function StepFact({ term, description }: StepFactProps) {
  return (
    <Row gap="ten" paddingVertical="eight">
      <Text bold>{term}</Text>
      <Text muted>{description}</Text>
    </Row>
  );
}

export function AgentStepDialog({
  role, node, draft, choices, constitution, editSender, asker, onClose
}: AgentStepDialogProps) {
  const [form, setForm] = useState<AgentStepForm>(() => AgentStepDialogModel.formOf(role, draft, node.settings));
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
              <Button label="Reset to default" emphasis="ghost" onPress={() => setForm(AgentStepDialogModel.resetFormOf(role))} />
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
        <Card step paddingVertical="four" paddingHorizontal="fourteen" divider>
          <StepFact term="Runs" description={words.runs} />
          {words.fixes === null ? null : <StepFact term="Fixes" description={words.fixes} />}
        </Card>
      </View>
    </Dialog>
  );
}
