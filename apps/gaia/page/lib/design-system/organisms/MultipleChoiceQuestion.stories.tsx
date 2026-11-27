import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState }            from 'react';
import { fn }                  from 'storybook/test';

import {
  MultipleChoiceQuestion,
  QuestionOption,
  QuestionOtherOption,
  type MultipleChoiceQuestionProps
} from './MultipleChoiceQuestion.tsx';

function AnsweredQuestion(props: MultipleChoiceQuestionProps) {
  const [chosen, setChosen] = useState(props.chosen);
  const [ownWords, setOwnWords] = useState('');
  const choose = (letter: string): void => {
    if (props.multiple !== true) setChosen([letter]);
    else setChosen(chosen.includes(letter) ? chosen.filter((chosenLetter) => chosenLetter !== letter) : [...chosen, letter]);
  };
  return (
    <MultipleChoiceQuestion {...props} chosen={chosen} onChoose={choose}>
      <QuestionOption letter="A" label="Example first option" description="An example description." recommendedLabel="Recommended" />
      <QuestionOption letter="B" label="Example second option" />
      <QuestionOtherOption letter="C" label="Other" placeholder="Example words" textLabel="Your own example words" text={ownWords} onText={setOwnWords} />
    </MultipleChoiceQuestion>
  );
}

const meta = {
  title:     'Organisms/MultipleChoiceQuestion',
  component: MultipleChoiceQuestion,
  args:      {
    eyebrow:     'Example decision',
    question:    'Which example option goes first?',
    chosen:      [],
    onChoose:    () => undefined,
    answerLabel: 'Answer',
    onAnswer:    fn(),
    children:    null,
  },
  render: (args) => <AnsweredQuestion {...args} />,
} satisfies Meta<typeof MultipleChoiceQuestion>;

export default meta;

type Story = StoryObj<typeof meta>;

export const OneChoice: Story = {};
export const Multiple: Story = { args: { multiple: true } };
export const Columns: Story = { args: { columns: true } };
export const Chosen: Story = { args: { chosen: ['A'] } };
export const Answered: Story = { args: { chosen: ['A'], answeredText: 'Example answer sent.' } };
export const Disabled: Story = { args: { disabled: true } };
export const WithContext: Story = { args: { context: 'Example finding: the run starts no database today.' } };
