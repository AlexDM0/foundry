import type { Meta, StoryObj } from '@storybook/react-vite';

import { IdLink } from './IdLink.tsx';

const meta = {
  title:     'Atoms/IdLink',
  component: IdLink,
  args:      { text: 'EX-102', href: '#example/EX-102' },
} satisfies Meta<typeof IdLink>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Plain: Story = {};
