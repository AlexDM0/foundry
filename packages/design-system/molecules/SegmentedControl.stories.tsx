import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState }            from 'react';

import { Text }                                         from '../atoms/Text.tsx';
import { View }                                         from '../atoms/View.tsx';
import { Menu, MenuItem }                               from './Menu.tsx';
import { SegmentedControl, type SegmentedControlProps } from './SegmentedControl.tsx';

type ExampleView = 'list' | 'grid' | 'chart';

function ChosenSegment(props: SegmentedControlProps<ExampleView>) {
  const [selected, setSelected] = useState(props.selected);
  return (
    <View gap="eight">
      <Text id="example-segment-label" typeRole="small" muted>Example view</Text>
      <SegmentedControl {...props} selected={selected} onSelect={setSelected} />
    </View>
  );
}

const meta = {
  title:     'Molecules/SegmentedControl',
  component: SegmentedControl<ExampleView>,
  args:      {
    labelledBy: 'example-segment-label',
    selected:   'list',
    onSelect:   () => undefined,
    options:    [
      { value: 'list', label: 'List' },
      { value: 'grid', label: 'Grid', count: 4 },
      { value: 'chart', label: 'Chart' },
    ],
  },
  render: (args) => <ChosenSegment {...args} />,
} satisfies Meta<typeof SegmentedControl<ExampleView>>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Standard: Story = {};
export const Compact: Story = { args: { size: 'compact' } };
export const Fill: Story = { args: { fill: true } };
export const NoneSelected: Story = { args: { selected: null } };
export const Mono: Story = { args: { mono: true } };
export const Separated: Story = { args: { separated: true, size: 'standard', fill: true } };
export const DisabledSegment: Story = {
  args: {
    options: [
      { value: 'list', label: 'List' },
      { value: 'grid', label: 'Grid', disabled: true },
      { value: 'chart', label: 'Chart' },
    ],
  },
};
export const OwnName: Story = {
  render: (args) => (
    <SegmentedControl accessibleName="Example view" options={args.options} selected={args.selected} onSelect={args.onSelect} />
  ),
};
export const TrailingMenu: Story = {
  args: {
    size:     'standard',
    trailing: (
      <Menu label="More example views" trigger="segment" align="end" triggerContent="2 more">
        <MenuItem label="Example table" closing="return-focus" onChoose={() => undefined} />
        <MenuItem label="Example grid" closing="return-focus" onChoose={() => undefined} />
      </Menu>
    ),
  },
};
