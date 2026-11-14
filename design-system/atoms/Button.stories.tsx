import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn }                  from 'storybook/test';

import { Button } from './Button.tsx';
import { Icon }   from './Icon.tsx';

const meta = {
  title:     'Atoms/Button',
  component: Button,
  args:      { label: 'Example action', onPress: fn() },
} satisfies Meta<typeof Button>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Quiet: Story = {};
export const Primary: Story = { args: { emphasis: 'primary' } };
export const Danger: Story = { args: { emphasis: 'danger', label: 'Remove the example' } };
export const Ghost: Story = { args: { emphasis: 'ghost' } };
export const Attention: Story = { args: { emphasis: 'primary', attention: true } };
export const LinkTint: Story = { args: { tint: 'link' } };
export const Compact: Story = { args: { compact: true } };
export const Dense: Story = { args: { dense: true } };
export const Disabled: Story = { args: { disabled: true } };
export const Pressed: Story = { args: { pressed: true } };
export const Leading: Story = { args: { leading: <Icon name="hammer" label={null} /> } };
export const AsLink: Story = { args: { href: '#example' } };
