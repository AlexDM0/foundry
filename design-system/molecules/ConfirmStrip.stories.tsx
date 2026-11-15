import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState }            from 'react';
import { fn }                  from 'storybook/test';

import { Button }       from '../atoms/Button.tsx';
import { Text }         from '../atoms/Text.tsx';
import { ConfirmStrip } from './ConfirmStrip.tsx';
import { Row }          from './Row.tsx';

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
