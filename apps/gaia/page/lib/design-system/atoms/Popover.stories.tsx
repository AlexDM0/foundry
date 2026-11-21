import type { Meta, StoryObj } from '@storybook/react-vite';
import { useRef, useState }    from 'react';

import { Button }                     from './Button.tsx';
import { Popover, type PopoverProps } from './Popover.tsx';
import { Text }                       from './Text.tsx';

type AnchoredPopoverProps = Pick<PopoverProps, 'label' | 'placement' | 'width'>;

function AnchoredPopover({ label, placement, width }: AnchoredPopoverProps) {
  const anchor = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(true);
  // The host positions the holder the popover hangs from: here a row as wide as a toolbar, the trigger at the end the popover aligns to.
  return (
    <div style={{ minHeight: 140 }}>
      <div ref={anchor} style={{
        position: 'relative', display: 'flex', justifyContent: placement === 'below-end' ? 'flex-end' : 'flex-start', width: 480
      }}>
        <Button label="Toggle the example" expanded={isOpen} onPress={() => setIsOpen(!isOpen)} />
        <Popover label={label} role="dialog" isOpen={isOpen} onDismiss={() => setIsOpen(false)} anchorRef={anchor} placement={placement} width={width}>
          <Text>Example popover content.</Text>
        </Popover>
      </div>
    </div>
  );
}

const meta = {
  title:     'Atoms/Popover',
  component: Popover,
  args:      {
    label:     'Example popover',
    role:      'dialog',
    isOpen:    true,
    onDismiss: () => undefined,
    anchorRef: { current: null },
    placement: 'below-start',
    width:     'standard',
    children:  null,
  },
  render: (args) => <AnchoredPopover label={args.label} placement={args.placement} width={args.width} />,
} satisfies Meta<typeof Popover>;

export default meta;

type Story = StoryObj<typeof meta>;

export const BelowStart: Story = {};
export const BelowEnd: Story = { args: { placement: 'below-end' } };
export const MenuWidth: Story = { args: { width: 'menu' } };
export const WideWidth: Story = { args: { width: 'wide' } };
export const InboxWidth: Story = { args: { width: 'inbox' } };
