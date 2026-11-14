import type { Meta, StoryObj } from '@storybook/react-vite';

import { FillMeter } from './FillMeter.tsx';

const meta = {
  title:     'Molecules/FillMeter',
  component: FillMeter,
  args:      {
    label: 'Example usage', used: 6, limit: 10, near: false, tone: 'accent'
  },
} satisfies Meta<typeof FillMeter>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Fill: Story = {};
export const Near: Story = { args: { used: 9, near: true, tone: 'neutral' } };
export const Unlimited: Story = { args: { used: 4, limit: null } };
