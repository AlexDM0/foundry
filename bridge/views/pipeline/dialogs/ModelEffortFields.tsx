/**
 * A step's model and effort side by side, as the step dialogs draw them: the model as a native select in a narrow column, the effort as a
 * row of choices filling the rest, one per value the board offers, and the effort hint under both where the dialog shows one.
 */
import { SegmentedControl } from 'design-system/SegmentedControl';
import { Text }             from 'design-system/Text';
import { View }             from 'design-system/View';
import { useId, type Ref }  from 'react';

import type { AgentEffort, AgentModel } from '../../../../src/lib/tracker-model/@types/Ticket.ts';

export interface ModelEffortFieldsProps {
  readonly models:          readonly AgentModel[];
  readonly efforts:         readonly AgentEffort[];
  readonly model:           AgentModel;
  readonly effort:          AgentEffort;
  readonly modelLabel:      string;
  readonly effortLabel:     string;
  readonly effortHint:      string | null;
  /** `standard` 36px fields, `compact` 32px for the re-review's settings. */
  readonly size:            'standard' | 'compact';
  readonly onModel:         (model: AgentModel) => void;
  readonly onEffort:        (effort: AgentEffort) => void;
  readonly modelSelectRef?: Ref<HTMLSelectElement>;
}

function isOfferedModel(models: readonly AgentModel[], value: string): value is AgentModel {
  return models.some((model) => model === value);
}

export function ModelEffortFields({
  models, efforts, model, effort, modelLabel, effortLabel, effortHint, size, onModel, onEffort, modelSelectRef
}: ModelEffortFieldsProps) {
  const modelSelectId = useId();
  const effortLabelId = useId();
  return (
    <View gap="eight">
      <div className="bridge-pipeline-dialog-settings" data-size={size}>
        <span className="bridge-pipeline-dialog-field">
          <label className="bridge-pipeline-dialog-label" htmlFor={modelSelectId}>{modelLabel}</label>
          <span className="bridge-pipeline-dialog-select">
            <select
              id={modelSelectId}
              ref={modelSelectRef}
              value={model}
              onChange={(event) => {
                if (isOfferedModel(models, event.target.value)) onModel(event.target.value);
              }}
            >
              {models.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
            <svg className="bridge-pipeline-dialog-select-chevron" viewBox="0 0 12 12" aria-hidden="true">
              <path d="M3 4.5 L6 7.5 L9 4.5" />
            </svg>
          </span>
        </span>
        <span className="bridge-pipeline-dialog-field">
          <span className="bridge-pipeline-dialog-label" id={effortLabelId}>{effortLabel}</span>
          <SegmentedControl
            labelledBy={effortLabelId}
            options={efforts.map((value) => ({ value, label: value }))}
            selected={effort}
            onSelect={onEffort}
            size={size}
            fill
            separated
          />
        </span>
      </div>
      {effortHint === null ? null : <Text typeRole="tab" subtle>{effortHint}</Text>}
    </View>
  );
}
