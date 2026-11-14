import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn }                  from 'storybook/test';

import { Toast } from './Toast.tsx';

const meta = {
  title:     'Molecules/Toast',
  component: Toast,
  args:      { title: 'Example saved', text: 'The example step is stored.', onExpired: fn() },
} satisfies Meta<typeof Toast>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Plain: Story = {};
export const WithCheck: Story = { args: { glyph: 'check' } };
