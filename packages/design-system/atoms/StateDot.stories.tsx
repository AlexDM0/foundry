import type { Meta, StoryObj } from '@storybook/react-vite';

import type { StateDotShape, StateTone } from '../@types/StateTone.ts';
import { StateDot }                      from './StateDot.tsx';
import { Text }                          from './Text.tsx';
import { View }                          from './View.tsx';

const STATE_TONES: readonly StateTone[] = ['neutral', 'accent', 'accent-outline', 'info', 'info-outline', 'info-deep', 'success', 'error', 'ink', 'muted'];
const DOT_SHAPES: readonly StateDotShape[] = ['solid', 'ring', 'dashed-ring'];

const meta = {
  title:     'Atoms/StateDot',
  component: StateDot,
  args:      { tone: 'accent' },
} satisfies Meta<typeof StateDot>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Accent: Story = {};
export const ErrorTone: Story = { args: { tone: 'error' } };
export const Ring: Story = { args: { tone: 'muted', shape: 'ring' } };
export const DashedRing: Story = { args: { tone: 'neutral', shape: 'dashed-ring' } };
export const Small: Story = { args: { small: true } };
export const Tiny: Story = { args: { tiny: true } };

export const EveryToneAndShape: Story = {
  render: () => (
    <View gap="eight">
      {STATE_TONES.map((tone) => (
        <View key={tone} row centerY gap="eight">
          {DOT_SHAPES.map((shape) => <StateDot key={shape} tone={tone} shape={shape} />)}
          <Text typeRole="small">{tone}</Text>
        </View>
      ))}
    </View>
  ),
};
