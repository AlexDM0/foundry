import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState }            from 'react';

import { NumberStepper, type NumberStepperProps } from './NumberStepper.tsx';

function SteppedNumber(props: NumberStepperProps) {
  const [value, setValue] = useState(props.value);
  return <NumberStepper {...props} value={value} onChange={setValue} />;
}

const meta = {
  title:     'Atoms/NumberStepper',
  component: NumberStepper,
  args:      {
    accessibleName: 'Example limit',
    value:          4,
    step:           1,
    minimum:        1,
    unitText:       'seats',
    lowerLabel:     'Lower the example limit',
    raiseLabel:     'Raise the example limit',
    onChange:       () => undefined,
  },
  render: (args) => <SteppedNumber {...args} />,
} satisfies Meta<typeof NumberStepper>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Unbounded: Story = {};
export const WithMaximum: Story = { args: { maximum: 6 } };
export const AtTheMinimum: Story = { args: { value: 1 } };
