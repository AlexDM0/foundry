/**
 * The conditional re-review's card, shared by the review step dialog's Re-review tab and the merge step dialog: its title with the
 * Conditional pill and its switch, and under a rule while on the threshold stepper, the re-reviewer's compact model and effort and its
 * brief; while off, the note on what leaves the flow.
 */

import { Card }           from 'design-system/Card';
import { NumberStepper }  from 'design-system/NumberStepper';
import { Row }            from 'design-system/Row';
import { Switch }         from 'design-system/Switch';
import { Tag }            from 'design-system/Tag';
import { Text }           from 'design-system/Text';
import { View }           from 'design-system/View';
import type { RefObject } from 'react';

import type { PipelineChoices, ResolvedInstructionEntry } from '../../../../src/lib/tracker-model/@types/PipelineFacts.ts';

import { InstructionsEditor }                                           from './InstructionsEditor.tsx';
import type { ConstitutionPlace }                                       from './InstructionsEditorModel.ts';
import { ModelEffortFields }                                            from './ModelEffortFields.tsx';
import { RereviewSettingsModel, type ReReviewForm, type ReReviewPlace } from './RereviewSettingsModel.ts';

export interface RereviewSettingsProps {
  readonly place:           ReReviewPlace;
  readonly form:            ReReviewForm;
  readonly choices:         PipelineChoices;
  readonly resolvedEntries: readonly ResolvedInstructionEntry[];
  readonly constitution:    ConstitutionPlace;
  readonly onChange:        (form: ReReviewForm) => void;
  /** Takes the switch, so a dialog opened from a re-review node opens on it. */
  readonly switchRef?:      RefObject<HTMLElement | null>;
}

const CONDITIONAL_WORD = 'Conditional';

/** The `Switch` part takes no ref, so the switch is found inside the span that holds it. */
function switchHeldBy(holder: HTMLSpanElement | null): HTMLElement | null {
  return holder?.querySelector<HTMLElement>('[role="switch"]') ?? null;
}

export function RereviewSettings({
  place, form, choices, resolvedEntries, constitution, onChange, switchRef
}: RereviewSettingsProps) {
  const words = RereviewSettingsModel.wordsOf(place);
  const role = RereviewSettingsModel.roleOf(place);
  return (
    <Card padding="none" divider>
      <Row between centerY gap="twelve" paddingVertical="twelve" paddingHorizontal="fourteen">
        <View>
          <Row centerY gap="eight">
            <Text typeRole="title">{words.title}</Text>
            <Tag text={CONDITIONAL_WORD} tone="neutral" />
          </Row>
          <Text typeRole="tab" muted>{words.subtitle}</Text>
        </View>
        <span className="bridge-pipeline-dialog-switch" ref={(holder) => {
          if (switchRef !== undefined) switchRef.current = switchHeldBy(holder);
        }}
        >
          <Switch accessibleName={words.title} checked={form.isOn} onToggle={() => onChange({ ...form, isOn: !form.isOn })} />
        </span>
      </Row>
      {form.isOn
        ? (
          <View gap="fourteen" padding="fourteen">
            <Row centerY gap="ten" wrap>
              <Text typeRole="lead">{words.thresholdLead}</Text>
              <NumberStepper
                accessibleName="Threshold in lines"
                value={form.thresholdLines}
                step={RereviewSettingsModel.THRESHOLD_STEP_LINES}
                minimum={RereviewSettingsModel.THRESHOLD_MINIMUM_LINES}
                unitText="lines"
                lowerLabel="Lower the threshold"
                raiseLabel="Raise the threshold"
                onChange={(thresholdLines) => onChange({ ...form, thresholdLines })}
              />
              <Text typeRole="lead">lines</Text>
            </Row>
            <ModelEffortFields
              models={choices.models}
              efforts={choices.efforts}
              model={form.settings.model}
              effort={form.settings.effort}
              modelLabel={words.modelLabel}
              effortLabel={words.effortLabel}
              effortHint={null}
              size="compact"
              onModel={(model) => onChange({ ...form, settings: { ...form.settings, model } })}
              onEffort={(effort) => onChange({ ...form, settings: { ...form.settings, effort } })}
            />
            <InstructionsEditor
              label={words.instructionsLabel}
              role={role}
              entries={form.settings.entries}
              resolvedEntries={resolvedEntries}
              constitution={constitution}
              onChange={(entries) => onChange({ ...form, settings: { ...form.settings, entries } })}
            />
            {words.scopeNote === null ? null : <Text typeRole="tab" subtle>{words.scopeNote}</Text>}
          </View>
        )
        : (
          <View paddingVertical="twelve" paddingHorizontal="fourteen">
            <Text muted>{words.offNote}</Text>
          </View>
        )}
    </Card>
  );
}
