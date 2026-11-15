import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn }                  from 'storybook/test';

import { Checkbox } from './Checkbox.tsx';

const meta = {
  title:     'Atoms/Checkbox',
  component: Checkbox,
  args:      { label: 'Send a daily summary', checked: true, onChange: fn() },
} satisfies Meta<typeof Checkbox>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Checked: Story = {};
export const Unchecked: Story = { args: { checked: false } };
export const Explained: Story = { args: { label: 'Questions', explanation: 'Someone asks, and the work waits on the answer.' } };
export const Disabled: Story = { args: { disabled: true } };
