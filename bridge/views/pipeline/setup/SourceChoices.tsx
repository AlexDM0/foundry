/**
 * The SOURCES block of the constitution step: what User asks the agent to draft the next constitution from. A tick sends the choices
 * with that one flipped; the box shows the facts, so it turns once the Overseer applied it. They steer the agent; they are not the tags.
 */
import type { PipelineSetupFacts }                                  from '../../../../src/lib/tracker-model/@types/PipelineFacts.ts';
import { ChoiceOption }                                             from '../../../design-system/ChoiceOption.tsx';
import { MicroCapsLabel }                                           from '../../../design-system/MicroCapsLabel.tsx';
import { useControlCommand }                                        from '../../../shell/ControlCommandSender.ts';
import { ConstitutionStepModel, SOURCE_CHOICES, type SourceChoice } from './ConstitutionStepModel.ts';

const CHOICE_LETTERS = ['a', 'b', 'c'] as const;

export interface SourceChoicesProps {
  readonly setup: PipelineSetupFacts;
}

interface SourceChoiceOptionProps {
  readonly setup:  PipelineSetupFacts;
  readonly choice: SourceChoice;
  readonly letter: string;
}

function SourceChoiceOption({ setup, choice, letter }: SourceChoiceOptionProps) {
  const sender = useControlCommand(ConstitutionStepModel.sourcesCommandOf(setup, choice.key));
  const checked = ConstitutionStepModel.sourcesOf(setup.record.constitution)[choice.key];
  return (
    <li className="bridge-pipeline-constitution-source" data-mono={choice.mono ? '' : undefined}>
      <ChoiceOption
        letter={letter}
        label={choice.label}
        chosen={checked}
        variant="card"
        input={{
          type: 'checkbox', name: `constitution-source-${choice.key}`, checked, accessibleName: choice.label, onChange: () => void sender.send(),
        }}
        {...(choice.note === null ? {} : { marks: <span className="bridge-pipeline-constitution-source-note">{choice.note}</span> })}
      />
      {sender.refusal === null ? null : <span className="bridge-refusal" role="status">{sender.refusal}</span>}
    </li>
  );
}

export function SourceChoices({ setup }: SourceChoicesProps) {
  return (
    <section className="bridge-pipeline-constitution-sources" aria-label="Sources">
      <MicroCapsLabel text="Sources" element="h3" />
      <ul className="bridge-pipeline-constitution-source-list">
        {SOURCE_CHOICES.map((choice, index) => (
          <SourceChoiceOption key={choice.key} setup={setup} choice={choice} letter={CHOICE_LETTERS[index] ?? ''} />
        ))}
      </ul>
    </section>
  );
}
