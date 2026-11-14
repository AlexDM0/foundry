/** Test-only: reads the design-system package's button back as a spec words it, so a claim about emphasis survives the package's flags. */
import { type HostElement, ReactElementTree } from './ReactElementTree.ts';

export const PackageButtons = {
  /** The package's button carries its emphasis as a flag: primary, ghost, or, with neither, the quiet secondary. */
  emphasisOf(button: HostElement): 'primary' | 'ghost' | 'quiet' {
    if (button.props['data-primary'] !== undefined) return 'primary';
    return button.props['data-ghost'] === undefined ? 'quiet' : 'ghost';
  },

  /** Whether an element is one of the package's buttons, drawn as a button or as a link. */
  isButton(element: HostElement): boolean {
    return ReactElementTree.hasClass(element, 'design-system-button');
  },
} as const;
