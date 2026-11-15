import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn }                  from 'storybook/test';

import { TextField } from './TextField.tsx';

const meta = {
  title:     'Atoms/TextField',
  component: TextField,
  args:      { label: 'Project name', value: 'Example Storefront', onChange: fn() },
} satisfies Meta<typeof TextField>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Words: Story = {};
export const Mono: Story = { args: { label: 'Folder', value: '/Users/example/storefront', mono: true } };
export const Placeholder: Story = { args: { value: '', placeholder: 'Example Storefront' } };
export const LabelHidden: Story = { args: { labelHidden: true } };
export const Disabled: Story = { args: { disabled: true } };
