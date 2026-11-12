/**
 * A step's model and effort as two stacked rows of segments, one per value the board offers, each row as wide as the dialog; the effort
 * hint follows the effort row where the dialog shows one. The selected model's button is handed out, so a dialog can open on it.
 */
import { useId, type Ref } from 'react';

import type { AgentEffort, AgentModel } from '../../../../src/lib/tracker-model/@types/Ticket.ts';
import { SegmentedControl }             from '../../../design-system/SegmentedControl.tsx';

export interface ModelEffortFieldsProps {
  readonly models:            readonly AgentModel[];
  readonly efforts:           readonly AgentEffort[];
  readonly model:             AgentModel;
  readonly effort:            AgentEffort;
  readonly modelLabel:        string;
  readonly effortLabel:       string;
  readonly effortHint:        string | null;
  readonly size:              'standard' | 'compact';
  readonly onModel:           (model: AgentModel) => void;
  readonly onEffort:          (effort: AgentEffort) => void;
  readonly selectedModelRef?: Ref<HTMLButtonElement>;
}

function assignedRef(ref: Ref<HTMLButtonElement> | undefined, element: HTMLButtonElement | null): void {
  if (typeof ref === 'function') ref(element);
  else if (ref !== null && ref !== undefined) ref.current = element;
}

export function ModelEffortFields({
  models, efforts, model, effort, modelLabel, effortLabel, effortHint, size, onModel, onEffort, selectedModelRef
}: ModelEffortFieldsProps) {
  const modelLabelId = useId();
  const effortLabelId = useId();
  return (
    <div className="bridge-pipeline-dialog-settings" data-size={size}>
      <div className="bridge-pipeline-dialog-field">
        <span className="bridge-pipeline-dialog-label" id={modelLabelId}>{modelLabel}</span>
        <SegmentedControl
          labelledBy={modelLabelId}
          options={models.map((value) => ({ value, label: value }))}
          selected={model}
          onSelect={onModel}
          size={size}
          fill
          optionRef={(value, element) => {
            if (value === model) assignedRef(selectedModelRef, element);
          }}
        />
      </div>
      <div className="bridge-pipeline-dialog-field">
        <span className="bridge-pipeline-dialog-label" id={effortLabelId}>{effortLabel}</span>
        <SegmentedControl
          labelledBy={effortLabelId}
          options={efforts.map((value) => ({ value, label: value }))}
          selected={effort}
          onSelect={onEffort}
          size={size}
          fill
        />
        {effortHint === null ? null : <span className="bridge-pipeline-dialog-hint">{effortHint}</span>}
      </div>
    </div>
  );
}
