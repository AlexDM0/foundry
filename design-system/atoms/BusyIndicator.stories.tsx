import type { Meta, StoryObj } from '@storybook/react-vite';

import { BusyIndicator } from './BusyIndicator.tsx';

const meta = {
  title:     'Atoms/BusyIndicator',
  component: BusyIndicator,
  args:      { shape: 'spinner', accessibleName: 'Loading the example' },
} satisfies Meta<typeof BusyIndicator>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Spinner: Story = {};
export const Bar: Story = { args: { shape: 'bar' } };
