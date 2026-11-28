import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn }                  from 'storybook/test';

import { Menu, MenuItem, MenuSeparator } from './Menu.tsx';

const items = (
  <>
    <MenuItem label="Example choice" hint="E" closing="return-focus" onChoose={fn()} />
    <MenuItem label="Example checked" checked closing="stays-open" onChoose={fn()} />
    <MenuSeparator />
    <MenuItem label="Example with description" description="An example description." closing="keep-focus" onChoose={fn()} />
    <MenuItem label="Example not now" disabled closing="keep-focus" onChoose={fn()} />
  </>
);

const meta = {
  title:     'Molecules/Menu',
  component: Menu,
  args:      {
    label: 'Example options', trigger: 'outlined', align: 'start', triggerContent: 'Example range', children: items
  },
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Menu>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Outlined: Story = {};
export const IconTrigger: Story = {
  args: {
    trigger: 'icon', triggerContent: '⋯', triggerName: 'Example options', align: 'end'
  }
};
export const ButtonTrigger: Story = { args: { trigger: 'button', triggerContent: 'More' } };
export const InsertSolid: Story = { args: { trigger: 'insert', insertStyle: 'solid', triggerName: 'Insert an example step' } };
export const InsertDashed: Story = { args: { trigger: 'insert', insertStyle: 'dashed', triggerName: 'Insert an example step' } };
export const Caret: Story = { args: { trigger: 'caret', triggerName: 'Example views', align: 'start' } };
export const Segment: Story = { args: { trigger: 'segment', triggerContent: '2 more', align: 'end' } };
export const SegmentPressed: Story = {
  args: {
    trigger: 'segment', triggerContent: 'Example four', align: 'end', pressed: true
  }
};
export const WithHeading: Story = { args: { heading: 'Example heading' } };
export const Marked: Story = { args: { marked: true } };
export const Wide: Story = {
  args: {
    trigger: 'button', triggerContent: 'More', wide: true, isOpen: true, onOpenChange: fn()
  }
};
export const Open: Story = { args: { isOpen: true, onOpenChange: fn() } };
