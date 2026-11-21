import type { Meta, StoryObj } from '@storybook/react-vite';

import { ModelEffortMeter } from './ModelEffortMeter.tsx';

const meta = {
  title:     'Molecules/ModelEffortMeter',
  component: ModelEffortMeter,
  args:      {
    model: 'example-model', effort: 'medium', level: 2, accessibleName: 'Example model, medium effort', size: 'node'
  },
} satisfies Meta<typeof ModelEffortMeter>;

export default meta;

type Story = StoryObj<typeof meta>;

export const NodeSize: Story = {};
export const DialogSize: Story = { args: { size: 'dialog' } };
export const HeroSize: Story = { args: { size: 'hero' } };
export const FiveLevels: Story = { args: { levelCount: 5, level: 4 } };
export const Derived: Story = { args: { derivedNote: { title: 'Derived', text: 'From the example writer.' } } };
