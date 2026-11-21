import type { Meta, StoryObj } from '@storybook/react-vite';

import { Stamp } from './Stamp.tsx';

const meta = {
  title:     'Atoms/Stamp',
  component: Stamp,
  args:      { shortText: '09:41' },
} satisfies Meta<typeof Stamp>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Short: Story = {};
export const WithFullText: Story = { args: { fullText: '2026-01-01 09:41:00' } };
export const AsTime: Story = { args: { element: 'time', fullText: '2026-01-01 09:41:00' } };
export const WithDateTime: Story = { args: { element: 'time', dateTime: '2026-01-01T09:41:00Z', fullText: '2026-01-01 09:41:00' } };
