import type { Meta, StoryObj } from '@storybook/react-vite';

import { Skeleton } from './Skeleton.tsx';

const meta = {
  title:     'Atoms/Skeleton',
  component: Skeleton,
  args:      { lines: 3, accessibleName: 'Loading the example' },
} satisfies Meta<typeof Skeleton>;

export default meta;

type Story = StoryObj<typeof meta>;

export const ThreeLines: Story = {};
export const OneLine: Story = { args: { lines: 1 } };
