import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState }            from 'react';

import { Button }    from '../atoms/Button.tsx';
import { FillMeter } from './FillMeter.tsx';
import { Row }       from './Row.tsx';

/** A share the reader changes: the bar fills from empty as it comes, then eases to each new share. */
function ChangingFill() {
  const [used, setUsed] = useState(4);
  return (
    <Row gap="twelve" centerY>
      <Button label="Use less" compact onPress={() => setUsed(Math.max(0, used - 2))} />
      <FillMeter label={`Example usage, ${used} of 10`} used={used} limit={10} near={used >= 8} tone="accent" />
      <Button label="Use more" compact onPress={() => setUsed(Math.min(10, used + 2))} />
    </Row>
  );
}

const meta = {
  title:     'Molecules/FillMeter',
  component: FillMeter,
  args:      {
    label: 'Example usage', used: 6, limit: 10, near: false, tone: 'accent'
  },
} satisfies Meta<typeof FillMeter>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Fill: Story = {};
export const Near: Story = { args: { used: 9, near: true, tone: 'neutral' } };
export const Unlimited: Story = { args: { used: 4, limit: null } };
export const Filling: Story = { render: () => <ChangingFill /> };
