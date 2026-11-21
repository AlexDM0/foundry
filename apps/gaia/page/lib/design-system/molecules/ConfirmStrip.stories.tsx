import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState }            from 'react';
import { fn }                  from 'storybook/test';

import { Button }                    from '../atoms/Button.tsx';
import { Text }                      from '../atoms/Text.tsx';
import { ChoiceInput, ChoiceOption } from './ChoiceOption.tsx';
import { ConfirmStrip }              from './ConfirmStrip.tsx';
import { Row }                       from './Row.tsx';

/** An action confirmed in place: the strip rises into the place of the action. */
function ConfirmingInPlace() {
  const [isConfirming, setIsConfirming] = useState(false);
  return (
    <Row centerY>
      {isConfirming
        ? (
          <ConfirmStrip
            label="Confirm the example"
            question="Stop the example build?"
            tone="neutral"
            confirm={<Button label="Stop" emphasis="primary" compact onPress={() => setIsConfirming(false)} />}
            cancelLabel="Cancel"
            onCancel={() => setIsConfirming(false)}
          />
        )
        : <Button label="Stop the example build" compact onPress={() => setIsConfirming(true)} />}
    </Row>
  );
}

const meta = {
  title:     'Molecules/ConfirmStrip',
  component: ConfirmStrip,
  args:      {
    label:       'Confirm the example',
    question:    'Stop the example build?',
    tone:        'neutral',
    confirm:     <Button label="Stop" emphasis="primary" compact onPress={fn()} />,
    cancelLabel: 'Cancel',
    onCancel:    fn(),
  },
} satisfies Meta<typeof ConfirmStrip>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Neutral: Story = {};
export const Danger: Story = {
  args: {
    tone:        'danger',
    question:    'Remove the example step?',
    consequence: <Text muted>The example step and its two example checks go.</Text>,
    confirm:     <Button label="Remove" emphasis="danger" onPress={fn()} />,
  },
};
export const Confirming: Story = { render: () => <ConfirmingInPlace /> };
const exampleChoices = (
  <>
    <ChoiceOption
      label="Finish the step"
      description="The example step finishes, then the build stops."
      chosen
      variant="card"
      input={<ChoiceInput type="radio" name="example-stop" checked accessibleName="Finish the step" onChange={fn()} />}
    />
    <ChoiceOption
      label="Stop now"
      description="The example step stops where it is."
      chosen={false}
      variant="card"
      input={<ChoiceInput type="radio" name="example-stop" checked={false} accessibleName="Stop now" onChange={fn()} />}
    />
  </>
);

/** The choices read in the body type and ink, never in the strip's small muted line. */
export const WithChoices: Story = {
  args: {
    question:    'How should the example build stop?',
    consequence: 'The example checks keep their results.',
    choices:     exampleChoices,
  },
};
export const DangerWithChoices: Story = {
  args: {
    tone:     'danger',
    question: 'How should the example build stop?',
    choices:  exampleChoices,
    confirm:  <Button label="Stop" emphasis="danger" onPress={fn()} />,
  },
};
