import type { Meta, StoryObj } from '@storybook/react-vite';

import { Stamp }       from '../atoms/Stamp.tsx';
import { ActivityRow } from './ActivityRow.tsx';

const meta = {
  title:     'Molecules/ActivityRow',
  component: ActivityRow,
  args:      {
    href: '#example/EX-101', status: 'step', idText: 'EX-101', stepText: 'Example writer', elapsed: '12 m'
  },
} satisfies Meta<typeof ActivityRow>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Step: Story = {};
export const Check: Story = { args: { status: 'check', stepText: 'Example check · tests', elapsed: '38 s' } };
export const WithMeter: Story = { args: { meter: <Stamp shortText="example" /> } };
