import type { Meta, StoryObj } from '@storybook/react-vite';

import { KeyedLineList } from './KeyedLineList.tsx';

const meta = {
  title:     'Molecules/KeyedLineList',
  component: KeyedLineList,
  args:      {
    label:     'Example log',
    keyColumn: 'stamp',
    lines:     [
      { key: '09:40', text: 'The example build started.' },
      { key: '09:41', text: 'The example tests ran.', mark: 'current' },
      { key: '09:42', text: 'The example check failed.', mark: 'alert' },
    ],
  },
} satisfies Meta<typeof KeyedLineList>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Stamps: Story = {};
export const Tools: Story = {
  args: {
    keyColumn: 'tool',
    lines:     [
      { key: 'Read', keyTitle: 'Example tool', text: 'example/File.ts' },
      { key: 'Edit', text: 'example/Other.ts' },
    ],
  },
};
