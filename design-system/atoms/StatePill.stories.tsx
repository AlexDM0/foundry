import type { Meta, StoryObj } from '@storybook/react-vite';

import { StatePill } from './StatePill.tsx';

const meta = {
  title:     'Atoms/StatePill',
  component: StatePill,
  args:      { label: 'Waiting', tone: 'info-outline', dashed: true },
} satisfies Meta<typeof StatePill>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Fixed: Story = {};
export const Fit: Story = { args: { width: 'fit' } };
export const Struck: Story = {
  args: {
    label: 'Closed', tone: 'muted', dashed: false, struck: true
  }
};
export const Toneless: Story = { render: () => <StatePill label="Example" /> };
