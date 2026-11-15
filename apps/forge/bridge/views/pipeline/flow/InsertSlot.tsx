/**
 * An add card where the pipeline misses a step: "Add a step", where it goes, and a choice for each missing step that fits there. A choice
 * either sends its draft edit or asks for a new gate's dialog in its phase; while the shell holds controls, every choice is disabled.
 */

import { Card }  from 'design-system/Card';
import { Row }   from 'design-system/Row';
import { Text }  from 'design-system/Text';
import { useId } from 'react';

import type { GatePhase } from '../../../../src/lib/tracker-model/@types/GatePhase.ts';

import { FlowGlyph }                                          from './FlowGlyph.tsx';
import type { FlowDraftEdit, FlowInsertChoice, FlowSlotView } from './PipelineFlowModel.ts';

export interface InsertSlotProps {
  readonly slot:      FlowSlotView;
  readonly disabled:  boolean;
  readonly onEdits:   (edits: readonly FlowDraftEdit[]) => void;
  readonly onNewGate: (phase: GatePhase) => void;
}

interface AddChoiceProps {
  readonly choice:   FlowInsertChoice;
  readonly disabled: boolean;
  readonly onChoose: () => void;
}

function AddChoice({ choice, disabled, onChoose }: AddChoiceProps) {
  const descriptionId = useId();
  return (
    <button
      type="button"
      className="bridge-pipeline-add-step-choice"
      aria-label={choice.label}
      aria-describedby={descriptionId}
      disabled={disabled}
      onClick={onChoose}
    >
      <span className="bridge-pipeline-add-step-choice-name">
        <FlowGlyph glyph="plus" />
        <Text bold>{choice.label}</Text>
      </span>
      <Text typeRole="small" muted id={descriptionId}>{choice.description}</Text>
    </button>
  );
}

export function InsertSlot({
  slot, disabled, onEdits, onNewGate
}: InsertSlotProps) {
  const choose = (choice: FlowInsertChoice): void => {
    if (choice.action.kind === 'new-gate') onNewGate(choice.action.phase);
    else onEdits(choice.action.edits);
  };
  return (
    <section className="bridge-pipeline-add-step" aria-label={slot.heading}>
      <Card dashed radius="step" grow gap="six">
        <Row centerY gap="seven">
          <FlowGlyph glyph="add" />
          <Text typeRole="small" muted>Add a step</Text>
        </Row>
        <Text typeRole="lead" bold>{slot.heading}</Text>
        {slot.choices.map((choice) => <AddChoice key={choice.step} choice={choice} disabled={disabled} onChoose={() => choose(choice)} />)}
      </Card>
    </section>
  );
}
