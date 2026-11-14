import type { Meta, StoryObj } from '@storybook/react-vite';

import { EmptyState } from './EmptyState.tsx';

const meta = {
  title:     'Atoms/EmptyState',
  component: EmptyState,
  args:      { text: 'No example items yet.' },
} satisfies Meta<typeof EmptyState>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Plain: Story = {};
export const WithAction: Story = { args: { text: 'Nothing here. ', children: <a href="#example">Example place</a> } };
export const Compact: Story = { args: { compact: true } };
