import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn }                  from 'storybook/test';

import { Button }       from '../atoms/Button.tsx';
import { Text }         from '../atoms/Text.tsx';
import { ConfirmStrip } from './ConfirmStrip.tsx';

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
    confirm:     <Button label="Remove" emphasis="danger" compact onPress={fn()} />,
  },
};
