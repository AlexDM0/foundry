import type { Meta, StoryObj } from '@storybook/react-vite';

import { Stepper } from './Stepper.tsx';

const meta = {
  title:     'Molecules/Stepper',
  component: Stepper,
  args:      {
    label:       'Example setup',
    orientation: 'horizontal',
    steps:       [
      {
        key: 'first', label: 'Example research', status: 'done', href: '#example/research'
      },
      {
        key: 'second', label: 'Example draft', status: 'recheck', href: '#example/draft', actionLabel: 'Check again'
      },
      { key: 'third', label: 'Example review', status: 'current' },
      { key: 'fourth', label: 'Example apply', status: 'upcoming' },
    ],
  },
} satisfies Meta<typeof Stepper>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Horizontal: Story = {};
export const Vertical: Story = { args: { orientation: 'vertical' } };
export const Compact: Story = { args: { compact: true } };
