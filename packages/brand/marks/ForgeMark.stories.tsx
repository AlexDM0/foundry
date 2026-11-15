import type { Meta, StoryObj } from '@storybook/react-vite';

import { ForgeMark } from './ForgeMark.tsx';

const meta = {
  title:     'Marks/ForgeMark',
  component: ForgeMark,
} satisfies Meta<typeof ForgeMark>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Standard: Story = {};
export const Enlarged: Story = { args: { sizePixels: 88 } };
export const WithTitle: Story = { args: { title: 'Double-click to open' } };
