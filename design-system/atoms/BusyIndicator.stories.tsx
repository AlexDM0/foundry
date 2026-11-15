import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState }            from 'react';

import { Row }           from '../molecules/Row.tsx';
import { BusyIndicator } from './BusyIndicator.tsx';
import { Button }        from './Button.tsx';

/** Work the reader starts and stops: the indicator fades in as it starts. */
function StartingWork({ shape }: { readonly shape: 'spinner' | 'bar' }) {
  const [isBusy, setIsBusy] = useState(false);
  return (
    <Row gap="twelve" centerY>
      <Button label={isBusy ? 'Stop the example' : 'Start the example'} compact onPress={() => setIsBusy(!isBusy)} />
      {isBusy ? <BusyIndicator shape={shape} accessibleName="Loading the example" /> : null}
    </Row>
  );
}

const meta = {
  title:     'Atoms/BusyIndicator',
  component: BusyIndicator,
  args:      { shape: 'spinner', accessibleName: 'Loading the example' },
} satisfies Meta<typeof BusyIndicator>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Spinner: Story = {};
export const Bar: Story = { args: { shape: 'bar' } };
export const StartingSpinner: Story = { render: () => <StartingWork shape="spinner" /> };
export const StartingBar: Story = { render: () => <StartingWork shape="bar" /> };
