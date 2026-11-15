import type { Meta, StoryObj } from '@storybook/react-vite';

import { DataTable } from './DataTable.tsx';

type ExampleColumn = 'name' | 'state' | 'count';

const meta = {
  title:     'Organisms/DataTable',
  component: DataTable<ExampleColumn>,
  args:      {
    label:        'Projects',
    columns:      [{ key: 'name', label: 'Name' }, { key: 'state', label: 'State' }, { key: 'count', label: 'Count', align: 'end' }],
    columnWidths: 'minmax(0, 1fr) 120px 80px',
    rows:         [
      { key: 'storefront', cells: { name: 'Example Storefront', state: 'Running', count: '4' } },
      { key: 'invoices', cells: { name: 'Example Invoices', state: 'Paused', count: '3' } },
      { key: 'mobile', cells: { name: 'Example Mobile App', state: 'Running', count: '2' } },
    ],
  },
} satisfies Meta<typeof DataTable<ExampleColumn>>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Regular: Story = {};
export const Compact: Story = { args: { rowHeight: 'compact', inset: 'wide' } };
export const Tall: Story = { args: { rowHeight: 'tall', columnGap: 'narrow' } };
export const SelectedWithContentBelow: Story = {
  args: {
    rows: [
      {
        key: 'storefront', cells: { name: 'Example Storefront', state: 'Running', count: '4' }, selected: true, below: 'Archive Example Storefront?'
      },
      { key: 'invoices', cells: { name: 'Example Invoices', state: 'Paused', count: '3' }, interactive: true },
    ],
  },
};
