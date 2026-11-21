/**
 * The SOURCES block of the constitution step: what User asks the agent to draft the next constitution from. A tick sends the choices
 * with that one flipped; the box shows the facts, so it turns once Hephaestus applied it. They steer the agent; they are not the tags.
 * At an entity they name its own CONTRIBUTING.md and research, and each tick names the entity.
 */
import type { BoardPipelineSetupDocument }                          from '../../../../@types/board/BoardPipelineDocuments.ts';
import { ChoiceInput, ChoiceOption, Text }                          from '../../../../lib/design-system/DesignSystemInterface.ts';
import { useControlCommand }                                        from '../../../shell/ControlCommandSender.ts';
import { ConstitutionStepModel, SOURCE_CHOICES, type SourceChoice } from './ConstitutionStepModel.ts';

export interface SourceChoicesProps {
  readonly setup:   BoardPipelineSetupDocument;
  /** In monorepo mode: the entity whose SOURCES they are, and their labels for it. */
  readonly entity?: { readonly key: string; readonly choices: readonly SourceChoice[] } | null;
}

interface SourceChoiceOptionProps {
  readonly setup:     BoardPipelineSetupDocument;
  readonly choice:    SourceChoice;
  readonly entityKey: string | null;
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
        {...(choice.note === null ? {} : { marks: <span className="board-pipeline-constitution-source-note">{choice.note}</span> })}
      />
      {sender.refusal === null ? null : <span className="board-refusal" role="status">{sender.refusal}</span>}
    </li>
  );
}

export function SourceChoices({ setup, entity = null }: SourceChoicesProps) {
  return (
    <section className="board-pipeline-constitution-sources" aria-label="Sources">
      <Text typeRole="small" subtle element="h4">Sources</Text>
      <ul className="board-pipeline-constitution-source-list">
        {(entity?.choices ?? SOURCE_CHOICES).map((choice) => (
          <SourceChoiceOption key={choice.key} setup={setup} choice={choice} entityKey={entity?.key ?? null} />
        ))}
      </ul>
    </section>
  );
}
