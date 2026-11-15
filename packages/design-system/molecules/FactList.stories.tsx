import type { Meta, StoryObj } from '@storybook/react-vite';

import { FactList } from './FactList.tsx';

const meta = {
  title:     'Molecules/FactList',
  component: FactList,
  args:      {
    layout: 'inline',
    facts:  [
      { label: 'Model', value: 'example-model' },
      { label: 'Effort', value: 'medium' },
      { label: 'Owner', value: 'Alex Example', sub: 'Example Agency' },
    ],
  },
} satisfies Meta<typeof FactList>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Inline: Story = {};
export const Grid: Story = { args: { layout: 'grid' } };
export const Table: Story = { args: { layout: 'table' } };
