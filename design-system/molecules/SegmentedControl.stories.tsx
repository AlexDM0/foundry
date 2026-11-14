import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState }            from 'react';

import { Text }                                         from '../atoms/Text.tsx';
import { View }                                         from '../atoms/View.tsx';
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
