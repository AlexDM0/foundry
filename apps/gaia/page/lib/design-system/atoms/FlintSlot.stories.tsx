import type { Meta, StoryObj } from '@storybook/react-vite';

import { FlintSlot } from './FlintSlot.tsx';

const meta = {
  title:     'Atoms/FlintSlot',
  component: FlintSlot,
  args:      { label: 'Flint waits for the example' },
} satisfies Meta<typeof FlintSlot>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Size112: Story = { args: { size: '112' } };
export const Size100: Story = { args: { size: '100' } };
export const Size60x50: Story = { args: { size: '60x50' } };
export const PageGround: Story = { args: { ground: 'page' } };
export const StripGround: Story = { args: { ground: 'strip' } };
export const LaneGround: Story = { args: { ground: 'lane' } };
export const DecisionGround: Story = { args: { ground: 'decision' } };
export const PlainGround: Story = { args: { ground: 'plain' } };
export const Hidden: Story = { args: { label: null } };
