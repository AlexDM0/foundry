/**
 * The root entity's row of the entities step: the root always exists and owns every path no other entity owns, its key fixed. Under it
 * User chooses what the root gets: kept for a person, the default, with no gates and no constitution, or gates and a constitution of its
 * own, so tickets may name it.
 */
import { ChoiceInput, ChoiceOption } from 'design-system/ChoiceOption';
import { MonoId }                    from 'design-system/MonoId';
import { Text }                      from 'design-system/Text';
import { useId }                     from 'react';

import type { RootChoice, RootEntityView } from './EntitiesStepModel.ts';

export interface RootEntityChoiceProps {
  readonly root:            RootEntityView;
  readonly gesturesAreOpen: boolean;
  readonly onChoose:        (choice: RootChoice) => void;
}

const ROOT_OPTIONS: readonly { readonly choice: RootChoice; readonly label: string; readonly description: string }[] = [
  { choice: 'person', label: 'Kept for a person', description: 'No gates, no constitution. Agents touch it only through a reach.' },
  { choice: 'gated', label: 'Gets gates and a constitution', description: 'Tickets may name root; its constitution is drafted next.' },
];

export function RootEntityChoice({ root, gesturesAreOpen, onChoose }: RootEntityChoiceProps) {
  const groupName = useId();
  return (
    <div className="board-root-entity" role="group" aria-label={`The root entity ${root.key}`}>
      <div className="board-root-entity-line">
        <span title="The root always exists. Its key cannot change."><MonoId text={root.key} tone="strong" weight="bold" /></span>
        <Text typeRole="small">Root</Text>
        <Text typeRole="small" muted>Owns every path no other entity owns</Text>
        <Text typeRole="small" muted>{root.constitutionText}</Text>
      </div>
      <div className="board-root-entity-choices" role="radiogroup" aria-label="What root gets">
        {ROOT_OPTIONS.map((option) => (
          <ChoiceOption
            key={option.choice}
            label={option.label}
            description={option.description}
            chosen={root.choice === option.choice}
            variant="card"
            tone="question"
            size="compact"
            input={(
              <ChoiceInput
                type="radio"
                name={groupName}
                checked={root.choice === option.choice}
                accessibleName={option.label}
                disabled={!gesturesAreOpen}
                onChange={() => onChoose(option.choice)}
              />
            )}
          />
        ))}
      </div>
    </div>
  );
}
