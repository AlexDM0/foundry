import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState }            from 'react';
import { fn }                  from 'storybook/test';

import {
  ChoiceFreeText,
  ChoiceInput,
  ChoiceMark,
  ChoiceOption
} from './ChoiceOption.tsx';
import { FactList } from './FactList.tsx';

/** Options the reader chooses between: the chosen input bumps once. */
function ChoosingOptions() {
  const [chosenLetter, setChosenLetter] = useState('A');
  return (
    <ul>
      {['A', 'B'].map((letter) => (
        <ChoiceOption
          key={letter}
          letter={letter}
          label={`Example option ${letter}`}
          chosen={chosenLetter === letter}
          variant="card"
          input={(
            <ChoiceInput
              type="radio"
              name="example-choosing"
              checked={chosenLetter === letter}
              accessibleName={`Example option ${letter}`}
              onChange={() => setChosenLetter(letter)}
            />
          )}
        />
      ))}
    </ul>
  );
}

const meta = {
  title:     'Molecules/ChoiceOption',
  component: ChoiceOption,
  args:      {
    letter:  'A',
    label:   'Example option',
    chosen:  false,
    variant: 'row',
    input:   <ChoiceInput type="radio" name="example-group" checked={false} accessibleName="Example option" onChange={fn()} />,
  },
} satisfies Meta<typeof ChoiceOption>;

export default meta;

type Story = StoryObj<typeof meta>;

export const RowVariant: Story = {};
export const Chosen: Story = {
  args: {
    chosen: true,
    input:  <ChoiceInput type="radio" name="example-group" checked accessibleName="Example option" onChange={fn()} />,
  },
};
export const CardVariant: Story = { args: { variant: 'card', description: 'An example description under the label.' } };
export const QuestionTone: Story = { args: { variant: 'card', tone: 'question' } };
export const Compact: Story = { render: () => <ul><ChoiceOption label="Example source" chosen={false} variant="card" size="compact" /></ul>, };
export const CompactMono: Story = { render: () => <ul><ChoiceOption label="docs/example.md" chosen variant="card" size="compact" mono /></ul>, };
export const Large: Story = {
  args: {
    variant: 'card', tone: 'question', size: 'large', description: 'An example description under the label.', facts: 'Touches an example folder'
  }
};
export const Roomy: Story = {
  render: () => (
    <ul>
      <ChoiceOption label="Example plan" description="An example description under the label." chosen variant="card" tone="question" size="roomy" />
    </ul>
  ),
};
export const Checkbox: Story = { args: { input: <ChoiceInput type="checkbox" name="example-group" checked={false} accessibleName="Example option" onChange={fn()} />, }, };
export const Marked: Story = { args: { marks: <ChoiceMark mark="recommended" text="Recommended" /> } };
export const WithFacts: Story = { args: { facts: <FactList layout="inline" facts={[{ label: 'Touches', value: 'Example step' }]} /> } };
export const FreeText: Story = {
  args: {
    letter:   'D',
    label:    'Other',
    chosen:   true,
    input:    <ChoiceInput type="radio" name="example-group" checked accessibleName="Other" onChange={fn()} />,
    freeText: <ChoiceFreeText value="" placeholder="Example words" accessibleName="Your own example words" onChange={fn()} />,
  },
};
export const ReadOnly: Story = { render: () => <ul><ChoiceOption letter="B" label="Example read-only option" chosen variant="row" /></ul>, };
export const Choosing: Story = { render: () => <ChoosingOptions /> };
