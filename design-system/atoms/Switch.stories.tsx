import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState }            from 'react';

import { Switch, type SwitchProps } from './Switch.tsx';

function ToggledSwitch(props: SwitchProps) {
  const [checked, setChecked] = useState(props.checked);
  return <Switch {...props} checked={checked} onToggle={() => setChecked(!checked)} />;
}

const meta = {
  title:     'Atoms/Switch',
  component: Switch,
  args:      { accessibleName: 'Example setting', checked: false, onToggle: () => undefined },
  render:    (args) => <ToggledSwitch {...args} />,
} satisfies Meta<typeof Switch>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Off: Story = {};
export const On: Story = { args: { checked: true } };
export const Disabled: Story = { args: { disabled: true } };
