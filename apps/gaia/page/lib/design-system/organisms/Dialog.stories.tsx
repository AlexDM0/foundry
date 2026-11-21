import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState }            from 'react';

import { Button }                   from '../atoms/Button.tsx';
import { Text }                     from '../atoms/Text.tsx';
import { Dialog, type DialogProps } from './Dialog.tsx';

function OpenableDialog(props: DialogProps) {
  const [isOpen, setIsOpen] = useState(props.isOpen);
  return (
    <>
      <Button label="Open the example dialog" onPress={() => setIsOpen(true)} />
      <Dialog {...props} isOpen={isOpen} onDismiss={() => setIsOpen(false)} />
    </>
  );
}

const meta = {
  title:     'Organisms/Dialog',
  component: Dialog,
  args:      {
    title:      'Example step',
    isOpen:     true,
    onDismiss:  () => undefined,
    closeLabel: 'Close',
    width:      'standard',
    children:   <Text>Example content of the dialog.</Text>,
  },
  render:     (args) => <OpenableDialog {...args} />,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Dialog>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Standard: Story = {};
export const Narrow: Story = { args: { width: 'narrow' } };
export const Wide: Story = { args: { width: 'wide' } };
export const Widest: Story = { args: { width: 'widest' } };
export const Page: Story = { args: { width: 'page' } };
export const WithKickerAndDescription: Story = { args: { kicker: 'Example kicker', description: 'An example description of the step.' } };
export const WithFoot: Story = { args: { foot: <Button label="Save" emphasis="primary" onPress={() => undefined} /> } };
export const WithHeadEnd: Story = { args: { headEnd: <Text typeRole="small" muted>Example note</Text> } };
