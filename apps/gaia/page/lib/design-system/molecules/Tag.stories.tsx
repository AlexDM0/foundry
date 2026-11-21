import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn }                  from 'storybook/test';

import { Tag } from './Tag.tsx';

const meta = {
  title:     'Molecules/Tag',
  component: Tag,
  args:      { text: 'example', tone: 'neutral' },
} satisfies Meta<typeof Tag>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Neutral: Story = {};
export const State: Story = {
  args: {
    tone: 'state', stateTone: 'info-outline', dot: true, dotShape: 'ring'
  }
};
export const Warn: Story = { args: { tone: 'warn', glyph: 'warning' } };
export const ErrorTone: Story = { args: { tone: 'error' } };
export const Dashed: Story = { args: { dashed: true, glyph: 'plus' } };
export const Stopwatch: Story = { args: { glyph: 'stopwatch', text: '12 m' } };
export const Check: Story = { args: { glyph: 'check' } };
export const Busy: Story = { args: { busy: true } };
export const Changed: Story = { args: { change: 'changed' } };
export const New: Story = { args: { change: 'new' } };
export const Removed: Story = { args: { change: 'removed' } };
export const Pops: Story = { args: { pops: true } };
export const AsLink: Story = { args: { href: '#example', title: 'Open the example' } };
export const ChipLink: Story = { args: { href: '#example', text: '#14', chip: true } };
export const AsButton: Story = { args: { onPress: fn() } };
