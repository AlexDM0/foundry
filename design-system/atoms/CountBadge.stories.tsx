import type { Meta, StoryObj } from '@storybook/react-vite';

import { CountBadge } from './CountBadge.tsx';

const meta = {
  title:     'Atoms/CountBadge',
  component: CountBadge,
  args:      { count: 3, tone: 'neutral' },
} satisfies Meta<typeof CountBadge>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Neutral: Story = {};
export const State: Story = { args: { tone: 'state', stateTone: 'accent' } };
export const Warn: Story = { args: { tone: 'warn' } };
export const ErrorTone: Story = { args: { tone: 'error' } };
export const Marked: Story = { args: { marked: true } };
