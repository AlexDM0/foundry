import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState }            from 'react';

import { CountBadge }           from '../atoms/CountBadge.tsx';
import { Tabs, type TabsProps } from './Tabs.tsx';

type ExampleTab = 'overview' | 'agents' | 'log';

function SelectedTabs(props: TabsProps<ExampleTab>) {
  const [selectedKey, setSelectedKey] = useState(props.selectedKey);
  return <Tabs {...props} selectedKey={selectedKey} onSelect={setSelectedKey} />;
}

const meta = {
  title:     'Organisms/Tabs',
  component: Tabs<ExampleTab>,
  args:      {
    label:       'Example views',
    selectedKey: 'overview',
    mode:        'switch',
    size:        'page',
    onSelect:    () => undefined,
    items:       [
      { key: 'overview', label: 'Overview' },
      { key: 'agents', label: 'Agents', countBadge: <CountBadge count={3} tone="neutral" /> },
      { key: 'log', label: 'Log', countBadge: <CountBadge count={1} tone="warn" /> },
    ],
  },
  render: (args) => <SelectedTabs {...args} />,
} satisfies Meta<typeof Tabs<ExampleTab>>;

export default meta;

type Story = StoryObj<typeof meta>;

export const SwitchPage: Story = {};
export const SwitchSection: Story = { args: { size: 'section' } };
export const Links: Story = {
  args: {
    mode:  'links',
    items: [
      { key: 'overview', label: 'Overview', href: '#overview' },
      { key: 'agents', label: 'Agents', href: '#agents' },
      { key: 'log', label: 'Log', href: '#log' },
    ],
  },
};
