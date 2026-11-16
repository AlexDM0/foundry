import type { Meta, StoryObj } from '@storybook/react-vite';

import { MonoId } from './MonoId.tsx';

const meta = {
  title:     'Atoms/MonoId',
  component: MonoId,
  args:      { text: 'EX-101' },
} satisfies Meta<typeof MonoId>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Plain: Story = {};
export const Muted: Story = { args: { tone: 'muted' } };
export const Strong: Story = { args: { tone: 'strong' } };
export const Compact: Story = { args: { compact: true } };
export const PillSize: Story = { args: { size: 'pill' } };
export const MicroSize: Story = { args: { size: 'micro' } };
export const Link: Story = { args: { tone: 'link' } };
export const Inherited: Story = { args: { tone: 'inherited' } };
export const Regular: Story = { args: { weight: 'regular' } };
export const Medium: Story = { args: { weight: 'medium' } };
export const Bold: Story = { args: { weight: 'bold', tone: 'strong' } };
