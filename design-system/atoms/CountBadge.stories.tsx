import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState }            from 'react';

import { Row }        from '../molecules/Row.tsx';
import { Button }     from './Button.tsx';
import { CountBadge } from './CountBadge.tsx';

/** A count the reader changes: it rises in as it grows and drops in as it shrinks. */
function ChangingCount() {
  const [count, setCount] = useState(3);
  return (
    <Row gap="eight" centerY>
      <Button label="One fewer" compact onPress={() => setCount(Math.max(0, count - 1))} />
      <CountBadge count={count} tone="warn" marked={count > 4} />
      <Button label="One more" compact onPress={() => setCount(count + 1)} />
    </Row>
  );
}

const meta = {
  title:     'Atoms/CountBadge',
  component: CountBadge,
  args:      { count: 3, tone: 'neutral' },
} satisfies Meta<typeof CountBadge>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Neutral: Story = {};
export const State: Story = { args: { tone: 'state', stateTone: 'accent' } };
export const Warn: Story = { args: { tone: 'warn' } };
export const ErrorTone: Story = { args: { tone: 'error' } };
export const Marked: Story = { args: { marked: true } };
export const Changing: Story = { render: () => <ChangingCount /> };
