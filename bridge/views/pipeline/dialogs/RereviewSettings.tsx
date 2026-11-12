/**
 * The conditional re-review's box, shared by the review and merge step dialogs: its switch, and while on the threshold stepper, the
 * re-reviewer's compact model and effort rows and its instruction list; while off, the note on what leaves the flow.
 */
import { useId, type RefObject } from 'react';

import type { PipelineChoices, ResolvedInstructionEntry } from '../../../../src/lib/tracker-model/@types/PipelineFacts.ts';
import { NumberStepper }                                  from '../../../design-system/NumberStepper.tsx';
import { Switch }                                         from '../../../design-system/Switch.tsx';

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

/** The `Switch` part takes no ref, so the switch is found inside the span that holds it. */
function switchHeldBy(holder: HTMLSpanElement | null): HTMLElement | null {
  return holder?.querySelector<HTMLElement>('[role="switch"]') ?? null;
}

export function RereviewSettings({
  place, form, choices, resolvedEntries, constitution, onChange, switchRef
}: RereviewSettingsProps) {
  const titleId = useId();
  const words = RereviewSettingsModel.wordsOf(place);
  const role = RereviewSettingsModel.roleOf(place);
  return (
    <section className="bridge-pipeline-dialog-rereview" aria-labelledby={titleId} data-on={form.isOn ? '' : undefined}>
      <div className="bridge-pipeline-dialog-rereview-head">
        <span className="bridge-pipeline-dialog-rereview-heading">
          <strong id={titleId}>{words.title}</strong>
          <span className="bridge-pipeline-dialog-hint">{words.subtitle}</span>
        </span>
        <span className="bridge-pipeline-dialog-switch" ref={(holder) => {
          if (switchRef !== undefined) switchRef.current = switchHeldBy(holder);
        }}
        >
          <Switch accessibleName={words.title} checked={form.isOn} onToggle={() => onChange({ ...form, isOn: !form.isOn })} />
        </span>
      </div>
      {form.isOn
        ? (
          <>
            <div className="bridge-pipeline-dialog-threshold">
              <span>{words.thresholdLead}</span>
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
              <span>lines</span>
            </div>
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
            {words.scopeNote === null ? null : <p className="bridge-pipeline-dialog-note">{words.scopeNote}</p>}
          </>
        )
        : <p className="bridge-pipeline-dialog-hint">{words.offNote}</p>}
    </section>
  );
}
