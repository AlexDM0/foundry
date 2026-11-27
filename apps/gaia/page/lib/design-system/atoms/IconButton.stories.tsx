import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn }                  from 'storybook/test';

import { Icon }       from './Icon.tsx';
import { IconButton } from './IconButton.tsx';

const meta = {
  title:     'Atoms/IconButton',
  component: IconButton,
  args:      { glyph: 'close', accessibleName: 'Close the example', onPress: fn() },
} satisfies Meta<typeof IconButton>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Glyph: Story = {};
export const Disabled: Story = { args: { disabled: true } };
/** The accent block beside a text box, as tall as its row. */
export const Accent: Story = {
  render: () => (
    <div style={{ display: 'flex', height: 58 }}>
      <IconButton drawing={<Icon name="paper-plane" label={null} />} accessibleName="Send the example" accent onPress={fn()} />
    </div>
  ),
};
export const AccentDisabled: Story = {
  render: () => (
    <div style={{ display: 'flex', height: 58 }}>
      <IconButton drawing={<Icon name="paper-plane" label={null} />} accessibleName="Send the example" accent disabled onPress={fn()} />
    </div>
  ),
};
export const Drawing: Story = { render: () => <IconButton drawing={<Icon name="dot" label={null} />} accessibleName="Example drawing" title="Example drawing" onPress={fn()} />, };
