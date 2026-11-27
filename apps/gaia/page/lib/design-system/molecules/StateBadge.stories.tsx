import type { Meta, StoryObj } from '@storybook/react-vite';

import type { StateTone } from '../@types/StateTone.ts';
import { View }           from '../atoms/View.tsx';
import { StateBadge }     from './StateBadge.tsx';

const STATE_TONES: readonly StateTone[] = ['neutral', 'accent', 'accent-outline', 'info', 'info-outline', 'info-deep', 'success', 'error', 'ink', 'muted'];

const meta = {
  title:     'Molecules/StateBadge',
  component: StateBadge,
  args:      { tone: 'accent', label: 'Running', pulsing: true },
} satisfies Meta<typeof StateBadge>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Standard: Story = {};
export const Compact: Story = { args: { size: 'compact' } };
export const Fitted: Story = { args: { fitted: true } };
export const Shrinkable: Story = { args: { label: 'Waiting on review', shrinkable: true } };
export const Waiting: Story = {
  args: {
    tone: 'neutral', label: 'Waiting', pulsing: false, dashed: true, dotShape: 'dashed-ring'
  }
};
export const Checked: Story = {
  args: {
    tone: 'ink', label: 'Done', pulsing: false, checked: true
  }
};
export const Struck: Story = {
  args: {
    tone: 'muted', label: 'Dropped', pulsing: false, struck: true, dotShape: 'ring'
  }
};
export const QuietPalette: Story = {
  args: {
    palette: 'quiet', tone: 'info-outline', label: 'Waiting', pulsing: false, dashed: true, dotShape: 'ring'
  }
};
export const DiamondDot: Story = { args: { tone: 'accent', label: 'Thinking', dotShape: 'diamond' } };
export const WithTitle: Story = { args: { title: 'Example badge title' } };

export const EveryTone: Story = {
  render: () => (
    <View row wrap gap="eight">
      {STATE_TONES.map((tone) => <StateBadge key={tone} tone={tone} label={tone} />)}
    </View>
  ),
};
