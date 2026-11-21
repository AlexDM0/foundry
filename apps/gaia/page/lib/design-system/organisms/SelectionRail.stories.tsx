import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState }            from 'react';

import { CountBadge }                                                    from '../atoms/CountBadge.tsx';
import { Icon }                                                          from '../atoms/Icon.tsx';
import { MonoId }                                                        from '../atoms/MonoId.tsx';
import { Text }                                                          from '../atoms/Text.tsx';
import { Tag }                                                           from '../molecules/Tag.tsx';
import { SelectionRail, type SelectionRailProps, type SelectionRailRow } from './SelectionRail.tsx';

const EXAMPLE_KEYS: Readonly<Record<string, readonly string[]>> = {
  Apps:     ['web', 'admin'],
  Packages: ['example-ui', 'example-contracts'],
};

function exampleRow(key: string, selectedKey: string): SelectionRailRow {
  return {
    key,
    accessibleName: `${key}, example part`,
    selected:       key === selectedKey,
    title:          <MonoId text={key} tone="strong" weight={key === selectedKey ? 'bold' : 'medium'} />,
    subtitle:       'example part',
    end:            key === 'admin' ? <Tag text="Example mark" tone="neutral" dashed /> : <CountBadge count={2} tone="neutral" />,
  };
}

/** Holds the selection and the filter text, which the rail leaves to its host. */
function SelectingRail(props: SelectionRailProps) {
  const [selectedKey, setSelectedKey] = useState('web');
  const [filterText, setFilterText] = useState('');
  const groups = Object.entries(EXAMPLE_KEYS).map(([label, keys]) => ({
    key:  label,
    label,
    rows: keys.filter((key) => key.includes(filterText.trim())).map((key) => exampleRow(key, selectedKey)),
  })).filter((group) => group.rows.length > 0);
  const leadingRow: SelectionRailRow = {
    key:            'everything',
    accessibleName: 'Everything, every example part',
    selected:       selectedKey === 'everything',
    title:          <Text bold>Everything</Text>,
    subtitle:       'every example part',
    mark:           <Icon name="flow" label={null} />,
  };
  return (
    <SelectionRail
      {...props}
      filterText={filterText}
      onFilterTextChange={setFilterText}
      leadingRows={[leadingRow]}
      groups={groups}
      noMatchText={groups.length === 0 ? 'No example part matches the filter.' : null}
      onSelect={setSelectedKey}
    />
  );
}

const meta = {
  title:     'Organisms/SelectionRail',
  component: SelectionRail,
  args:      {
    label:              'Example parts',
    filterLabel:        'Filter example parts',
    filterText:         '',
    onFilterTextChange: () => undefined,
    groups:             [],
    onSelect:           () => undefined,
  },
  render: (args) => <SelectingRail {...args} />,
} satisfies Meta<typeof SelectionRail>;

export default meta;

type Story = StoryObj<typeof meta>;

export const CurrentPage: Story = {};
export const Filter: Story = { args: { meaning: 'pressed' } };
export const WithAttentionAndNote: Story = { args: { attentionText: '1 example part needs a look', note: 'An example note at the foot of the column.' } };
