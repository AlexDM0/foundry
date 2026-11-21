import type { Meta, StoryObj } from '@storybook/react-vite';

import { LogTail } from './LogTail.tsx';

const meta = {
  title:     'Molecules/LogTail',
  component: LogTail,
  args:      {
    label: 'Example output',
    live:  false,
    lines: [
      { key: 'first', text: 'example test', kind: 'command' },
      { key: 'second', text: '12 example tests pass', kind: 'output' },
    ],
  },
} satisfies Meta<typeof LogTail>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Finished: Story = {};
export const Live: Story = { args: { live: true } };
