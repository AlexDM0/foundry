import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState }            from 'react';

import { Text }                                                             from '../atoms/Text.tsx';
import { ReorderableList, type ReorderableItem, type ReorderableListProps } from './ReorderableList.tsx';

interface ExampleRow {
  readonly name:   string;
  readonly band?:  string;
  readonly faded?: boolean;
}

const CHECK_ROWS: readonly ExampleRow[] = [{ name: 'example lint' }, { name: 'example build' }, { name: 'example test' }];
const FADED_ROWS: readonly ExampleRow[] = [{ name: 'example lint' }, { name: 'example build', faded: true }, { name: 'example test' }];
const BANDED_ROWS: readonly ExampleRow[] = [
  { name: 'example install', band: 'Prepare' },
  { name: 'example lint', band: 'Check' },
  { name: 'example test', band: 'Check' },
];

function itemsOf(rows: readonly ExampleRow[]): ReorderableItem[] {
  return rows.map((row, index) => ({
    key:       row.name,
    content:   <Text>{row.name}</Text>,
    grabLabel: `Move ${row.name}, position ${String(index + 1)} of ${String(rows.length)}`,
    ...(row.band === undefined ? {} : { band: row.band }),
    ...(row.faded === true ? { faded: true } : {}),
  }));
}

function movedRows(rows: readonly ExampleRow[], fromIndex: number, toIndex: number): ExampleRow[] {
  const moved = [...rows];
  const [row] = moved.splice(fromIndex, 1);
  if (row !== undefined) moved.splice(toIndex, 0, row);
  return moved;
}

function ReorderedList({ rows, label }: { readonly rows: readonly ExampleRow[]; readonly label: string }) {
  const [order, setOrder] = useState(rows);
  const props: ReorderableListProps = {
    label,
    items:     itemsOf(order),
    onReorder: (fromIndex, toIndex) => setOrder(movedRows(order, fromIndex, toIndex)),
    announce:  (fromIndex, toIndex) => `Moved from position ${String(fromIndex + 1)} to ${String(toIndex + 1)}`,
  };
  return <ReorderableList {...props} />;
}

const meta = {
  title:     'Organisms/ReorderableList',
  component: ReorderableList,
  args:      {
    label: 'Example checks', items: [], onReorder: () => undefined, announce: () => ''
  },
} satisfies Meta<typeof ReorderableList>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Plain: Story = { render: (args) => <ReorderedList rows={CHECK_ROWS} label={args.label} /> };
export const Banded: Story = { render: (args) => <ReorderedList rows={BANDED_ROWS} label={args.label} /> };
export const Faded: Story = { render: (args) => <ReorderedList rows={FADED_ROWS} label={args.label} /> };
