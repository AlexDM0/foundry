import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn }                  from 'storybook/test';
import { Button }              from '../atoms/Button.tsx';

import { PendingStep } from './PendingStep.tsx';

const meta = {
  title:     'Molecules/PendingStep',
  component: PendingStep,
  args:      {
    word: 'Saved; publish pending.', sentence: 'Readers see the old page until it is published.', dismissLabel: 'Dismiss the pending publish', onDismiss: fn()
  },
} satisfies Meta<typeof PendingStep>;

export default meta;

type Story = StoryObj<typeof meta>;

export const WordAndSentence: Story = {};
export const WithAction: Story = { args: { action: <Button label="Publish" emphasis="primary" compact /> } };
export const Edgeless: Story = { args: { edgeless: true, action: <Button label="Publish" emphasis="primary" compact /> } };
