import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn }                  from 'storybook/test';

import { TextButton } from './TextButton.tsx';

const meta = {
  title:     'Atoms/TextButton',
  component: TextButton,
  args:      { label: 'Example text action', onPress: fn() },
} satisfies Meta<typeof TextButton>;

export default meta;

type Story = StoryObj<typeof meta>;

export const AsButton: Story = {};
export const AsLink: Story = { args: { label: 'Example text link', href: '#example' } };
