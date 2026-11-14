import type { Meta, StoryObj } from '@storybook/react-vite';

import { SlotMeter } from './SlotMeter.tsx';

const meta = {
  title:     'Molecules/SlotMeter',
  component: SlotMeter,
  args:      {
    label: 'Example seats', filled: 2, limit: 4, tone: 'accent'
  },
} satisfies Meta<typeof SlotMeter>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Slots: Story = {};
