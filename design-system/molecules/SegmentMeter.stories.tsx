import type { Meta, StoryObj } from '@storybook/react-vite';

import { SegmentMeter } from './SegmentMeter.tsx';

const meta = {
  title:     'Molecules/SegmentMeter',
  component: SegmentMeter,
  args:      {
    label:    'Example items by state',
    segments: [
      { tone: 'ink', count: 5, label: '5 done' },
      { tone: 'accent', count: 3, label: '3 in progress' },
      { tone: 'neutral', count: 2, label: '2 waiting' },
    ],
  },
} satisfies Meta<typeof SegmentMeter>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Segments: Story = {};
