import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState }            from 'react';

import { Button }    from '../atoms/Button.tsx';
import { Row }       from './Row.tsx';
import { SlotMeter } from './SlotMeter.tsx';

/** Seats the reader fills: a cell turns its colour as it fills, and a cell past the limit pops in. */
function FillingSlots() {
  const [filled, setFilled] = useState(1);
  return (
    <Row gap="twelve" centerY>
      <Button label="Free one" compact onPress={() => setFilled(Math.max(0, filled - 1))} />
      <SlotMeter label={`Example seats, ${filled} of 4`} filled={filled} limit={4} tone="accent" />
      <Button label="Take one" compact onPress={() => setFilled(filled + 1)} />
    </Row>
  );
}

const meta = {
  title:     'Molecules/SlotMeter',
  component: SlotMeter,
  args:      {
    label: 'Example seats', filled: 2, limit: 4, tone: 'accent'
  },
} satisfies Meta<typeof SlotMeter>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Slots: Story = {};
export const Filling: Story = { render: () => <FillingSlots /> };
