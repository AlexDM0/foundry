/**
 * The SOURCES block of the constitution step: what User asks the agent to draft the next constitution from. A tick sends the choices
 * with that one flipped; the box shows the facts, so it turns once the Overseer applied it. They steer the agent; they are not the tags.
 * At an entity they name its own CONTRIBUTING.md and research, and each tick names the entity.
 */
import { ChoiceInput, ChoiceOption } from 'design-system/ChoiceOption';
import { Text }                      from 'design-system/Text';

import type { EntityKey }                                           from '../../../../src/lib/tracker-model/@types/Pipeline.ts';
import type { PipelineSetupFacts }                                  from '../../../../src/lib/tracker-model/@types/PipelineFacts.ts';
import { useControlCommand }                                        from '../../../shell/ControlCommandSender.ts';
import { ConstitutionStepModel, SOURCE_CHOICES, type SourceChoice } from './ConstitutionStepModel.ts';

export interface SourceChoicesProps {
  readonly setup:   PipelineSetupFacts;
  /** In monorepo mode: the entity whose SOURCES they are, and their labels for it. */
  readonly entity?: { readonly key: EntityKey; readonly choices: readonly SourceChoice[] } | null;
}

interface SourceChoiceOptionProps {
  readonly setup:     PipelineSetupFacts;
  readonly choice:    SourceChoice;
  readonly entityKey: EntityKey | null;
}

function SourceChoiceOption({ setup, choice, entityKey }: SourceChoiceOptionProps) {
  const sender = useControlCommand(ConstitutionStepModel.sourcesCommandOf(setup, choice.key, entityKey));
  const checked = ConstitutionStepModel.sourcesOf(setup.record.constitution)[choice.key];
  return (
    <li>
      <ChoiceOption
        label={choice.label}
        chosen={checked}
        variant="card"
        size="compact"
        mono={choice.mono}
        input={<ChoiceInput type="checkbox" name={`constitution-source-${choice.key}`} checked={checked} accessibleName={choice.label} onChange={() => void sender.send()} />}
        {...(choice.note === null ? {} : { marks: <span className="bridge-pipeline-constitution-source-note">{choice.note}</span> })}
      />
      {sender.refusal === null ? null : <span className="bridge-refusal" role="status">{sender.refusal}</span>}
    </li>
  );
}

export function SourceChoices({ setup, entity = null }: SourceChoicesProps) {
  return (
    <section className="bridge-pipeline-constitution-sources" aria-label="Sources">
      <Text typeRole="small" subtle element="h4">Sources</Text>
      <ul className="bridge-pipeline-constitution-source-list">
        {(entity?.choices ?? SOURCE_CHOICES).map((choice) => (
          <SourceChoiceOption key={choice.key} setup={setup} choice={choice} entityKey={entity?.key ?? null} />
        ))}
      </ul>
    </section>
  );
}
