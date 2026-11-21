/**
 * The conditional re-review's card, shared by the review step dialog's Re-review tab and the merge step dialog: its title with the
 * Conditional pill and its switch, and under a rule while on the threshold stepper, the re-reviewer's compact model and effort and its
 * brief; while off, the note on what leaves the flow. In monorepo mode the merge train's re-review is split by level: the forge sets its
 * switch and threshold alone, and an entity sets its own conflict re-reviewer, with the forge's switch and threshold read only and linked.
 */

import type { RefObject } from 'react';

import type { BoardPipelineChoicesDocument, BoardResolvedInstructionDocument } from '../../../../@types/board/BoardPipelineDocuments.ts';
import {
  Card,
  NumberStepper,
  Row,
  Switch,
  Tag,
  Text,
  TextButton,
  View
} from '../../../../lib/design-system/DesignSystemInterface.ts';
import { InstructionsEditor }     from './InstructionsEditor.tsx';
import type { ConstitutionPlace } from './InstructionsEditorModel.ts';
import { ModelEffortFields }      from './ModelEffortFields.tsx';
import {
  RereviewSettingsModel,
  type ReReviewForm,
  type ReReviewLevelPart,
  type ReReviewPlace
} from './RereviewSettingsModel.ts';

export interface RereviewSettingsProps {
  readonly place:              ReReviewPlace;
  readonly form:               ReReviewForm;
  /** The lines the threshold field steps by, and its least value. */
  readonly thresholdStepLines: number;
  readonly choices:            BoardPipelineChoicesDocument;
  readonly resolvedEntries:    readonly BoardResolvedInstructionDocument[];
  readonly constitution:       ConstitutionPlace;
  readonly onChange:           (form: ReReviewForm) => void;
  /** Takes the switch, so a dialog opened from a re-review node opens on it. */
  readonly switchRef?:         RefObject<HTMLElement | null>;
  /** Which part of the card a monorepo level sets; absent sets the whole card. */
  readonly levelPart?:         ReReviewLevelPart;
  /** Where the forge sets the switch and threshold, linked from an entity's card. */
  readonly forgeLevelHref?:    string;
}

const SET_AT_THE_FORGE_TEXT = 'Set at the Forge level';

const SET_BY_EACH_ENTITY_TEXT = 'Each entity sets the model, effort and brief of its own conflict re-reviewer.';

const CONDITIONAL_WORD = 'Conditional';

/** The `Switch` part takes no ref, so the switch is found inside the span that holds it. */
function switchHeldBy(holder: HTMLSpanElement | null): HTMLElement | null {
  return holder?.querySelector<HTMLElement>('[role="switch"]') ?? null;
}

export function RereviewSettings({
  place, form, thresholdStepLines, choices, resolvedEntries, constitution, onChange, switchRef, levelPart = 'whole', forgeLevelHref
}: RereviewSettingsProps) {
  const words = RereviewSettingsModel.wordsOf(place);
  const role = RereviewSettingsModel.roleOf(place);
  const forgeSettingsAreReadOnly = levelPart === 'conflict-re-reviewer';
  const forgeLink = forgeLevelHref === undefined ? null : <TextButton label={SET_AT_THE_FORGE_TEXT} href={forgeLevelHref} />;
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
        <span className="board-pipeline-dialog-switch" ref={(holder) => {
          if (switchRef !== undefined) switchRef.current = switchHeldBy(holder);
        }}
        >
          {forgeSettingsAreReadOnly ? forgeLink : null}
          <Switch
            accessibleName={words.title}
            checked={form.isOn}
            disabled={forgeSettingsAreReadOnly}
            onToggle={() => onChange({ ...form, isOn: !form.isOn })}
          />
        </span>
      </Row>
      {form.isOn
        ? (
          <View gap="fourteen" padding="fourteen">
            <Row centerY gap="ten" wrap>
              <Text typeRole="lead">{words.thresholdLead}</Text>
              {forgeSettingsAreReadOnly
                ? <Text typeRole="lead" bold>{String(form.thresholdLines)}</Text>
                : (
                  <NumberStepper
                    accessibleName="Threshold in lines"
                    value={form.thresholdLines}
                    step={thresholdStepLines}
                    minimum={thresholdStepLines}
                    unitText="lines"
                    lowerLabel="Lower the threshold"
                    raiseLabel="Raise the threshold"
                    onChange={(thresholdLines) => onChange({ ...form, thresholdLines })}
                  />
                )}
              <Text typeRole="lead">lines</Text>
            </Row>
            {levelPart === 'merge-train' ? <Text typeRole="tab" subtle>{SET_BY_EACH_ENTITY_TEXT}</Text> : null}
            {levelPart === 'merge-train' ? null : (
              <>
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
              </>
            )}
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
