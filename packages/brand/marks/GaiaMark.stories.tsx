import type { Meta, StoryObj } from '@storybook/react-vite';

import { GaiaMark } from './GaiaMark.tsx';

const meta = {
  title:     'Marks/GaiaMark',
  component: GaiaMark,
} satisfies Meta<typeof GaiaMark>;

export default meta;

type Story = StoryObj<typeof meta>;

export const LargeDrawing: Story = {};
export const SmallDrawing: Story = { args: { sizePixels: 16 } };
export const Enlarged: Story = { args: { sizePixels: 88 } };
