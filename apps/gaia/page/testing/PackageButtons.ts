/** Test-only: reads the design-system package's button, kept folded, by the props Gaia hands it: its emphasis, its name and its press. */
import { Button } from '../lib/design-system/DesignSystemInterface.ts';

import { type HostElement, ReactElementTree, type RenderedNode } from './ReactElementTree.ts';

export const PackageButtons = {
  /** The emphasis Gaia gave the button; with none given, the package's quiet default. */
  emphasisOf(button: HostElement): string {
    const { emphasis } = button.props;
    return typeof emphasis === 'string' ? emphasis : 'quiet';
  },

  /** Whether an element is the package's button, drawn as a button or as a link. */
  isButton(element: HostElement): boolean {
    return ReactElementTree.withComponent(Button)(element);
  },

  /** Every package button, at any depth, in document order. */
  buttonsIn(nodes: readonly RenderedNode[]): HostElement[] {
    return ReactElementTree.hostElementsIn(nodes, PackageButtons.isButton);
  },

  /** The one package button with this label; none or several fail the spec. */
  onlyLabelled(nodes: readonly RenderedNode[], label: string): HostElement {
    return ReactElementTree.onlyHostElementIn(nodes, (element) => PackageButtons.isButton(element) && PackageButtons.labelOf(element) === label);
  },

  /** The label Gaia gave the button, the text a reader sees on it. */
  labelOf(button: HostElement): string {
    return String(button.props['label']);
  },

  /** The name a screen reader announces: the accessible name Gaia gave, or else the label. */
  nameOf(button: HostElement): string {
    const { accessibleName } = button.props;
    return typeof accessibleName === 'string' ? accessibleName : PackageButtons.labelOf(button);
  },

  /** Presses the button as a reader would; a button with no press handler fails the spec. */
  press(button: HostElement): void {
    ReactElementTree.dispatch(button, 'onPress');
  },
} as const;
