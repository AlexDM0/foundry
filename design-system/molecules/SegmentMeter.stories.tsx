import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState }            from 'react';

import { Button }       from '../atoms/Button.tsx';
import { Row }          from './Row.tsx';
import { SegmentMeter } from './SegmentMeter.tsx';

/** Counts the reader moves on: the parts grow from nothing as they come, then ease to each new count. */
function MovingCounts() {
  const [done, setDone] = useState(2);
  const waiting = 10 - done;
  return (
    <Row gap="twelve" centerY>
      <Button label="Finish one" compact disabled={waiting === 0} onPress={() => setDone(done + 1)} />
      <SegmentMeter
        label={`Example items by state: ${done} done, ${waiting} waiting`}
        segments={[{ tone: 'ink', count: done, label: `${done} done` }, { tone: 'neutral', count: waiting, label: `${waiting} waiting` }]}
      />
    </Row>
  );
}

const meta = {
  title:     'Molecules/SegmentMeter',
  component: SegmentMeter,
  args:      {
    label:    'Example items by state',
    segments: [
      { tone: 'ink', count: 5, label: '5 done' },
      { tone: 'accent', count: 3, label: '3 in progress' },
      { tone: 'neutral', count: 2, label: '2 waiting' },
    ],
  },
} satisfies Meta<typeof SegmentMeter>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Segments: Story = {};
export const Moving: Story = { render: () => <MovingCounts /> };
