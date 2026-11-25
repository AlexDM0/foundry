/**
 * The ways an agent bills as cards, as its vendor serves them, its default marked; the API key's card names the variable the key is read
 * from and takes the cap per launch where a launch takes one. Shared by the setup's billing step and the forge's settings.
 */
import { useId } from 'react';
import {
  ChoiceInput,
  ChoiceOption,
  Row,
  Tag,
  Text,
  View
} from '../../../../lib/design-system/DesignSystemInterface.ts';
import type { BillingCard, BillingChoice } from '../setup/BillingStepModel.ts';

export interface BillingCardsProps {
  readonly cards:    readonly BillingCard[];
  readonly choice:   BillingChoice;
  readonly onChoose: (choice: BillingChoice) => void;
}

function CapPerLaunch({ choice, onChoose }: Omit<BillingCardsProps, 'cards'>) {
  return (
    <span className="board-pipeline-billing-cap">
      Cap per launch
      <span className="board-pipeline-billing-cap-field">
        $
        <input
          className="board-pipeline-billing-cap-input"
          type="text"
          inputMode="decimal"
          value={choice.capText}
          placeholder="none"
          aria-label="Cap per launch in US dollars"
          onFocus={() => onChoose({ ...choice, mode: 'api' })}
          onChange={(event) => onChoose({ mode: 'api', capText: event.currentTarget.value })}
        />
      </span>
      <Text typeRole="small" subtle>Optional</Text>
    </span>
  );
}

/** The variable the key must be in, as forge serves it, and the cap per launch where a launch takes one. */
function KeyFacts({ card, choice, onChoose }: Omit<BillingCardsProps, 'cards'> & { readonly card: BillingCard }) {
  return (
    <View gap="six">
      {card.keyVariableName === null
        ? null
        : (
          <Row centerY gap="six" wrap>
            <Text muted>Read from</Text>
            <Text mono>{card.keyVariableName}</Text>
          </Row>
        )}
      {card.capsEachLaunch ? <CapPerLaunch choice={choice} onChoose={onChoose} /> : null}
    </View>
  );
}

export function BillingCards({ cards, choice, onChoose }: BillingCardsProps) {
  const groupName = useId();
  return (
    <div className="board-pipeline-billing-cards">
      {cards.map((card) => (
        <ChoiceOption
          key={card.mode}
          label={card.label}
          description={card.description}
          chosen={choice.mode === card.mode}
          variant="card"
          tone="question"
          size="roomy"
          input={(
            <ChoiceInput
              type="radio"
              name={groupName}
              checked={choice.mode === card.mode}
              accessibleName={card.label}
              onChange={() => onChoose({ ...choice, mode: card.mode })}
            />
          )}
          {...(card.isDefault ? { marks: <Tag text="Default" tone="neutral" /> } : {})}
          {...(card.mode === 'api' ? { facts: <KeyFacts card={card} choice={choice} onChoose={onChoose} /> } : {})}
        />
      ))}
    </div>
  );
}
