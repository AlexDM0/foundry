/**
 * Test-only: tells the controls in an unfolded tree, host or package, and the name a reader hears for each, from the props Gaia sets or
 * hands a folded package part, so a spec can claim "every control has a name" without reading the markup the package draws.
 */
import { type HostElement, ReactElementTree } from './ReactElementTree.ts';

const HOST_CONTROL_TAGS: readonly string[] = ['button', 'input', 'select', 'textarea'];

/** A handler prop such as `onPress` or `onChange`. */
const HANDLER_PROP = /^on[A-Z]/;

export const PackageControls = {
  /** A host control, or a package part Gaia hands a handler or a link. */
  isControl(element: HostElement): boolean {
    if (HOST_CONTROL_TAGS.includes(element.tag)) return true;
    return ReactElementTree.isPackagePart(element) && Object.keys(element.props).some((propName) => propName === 'href' || HANDLER_PROP.test(propName));
  },

  /** Whether Tab stops on the element: a link, or a control that is not disabled, unless its tab index says otherwise. */
  isFocusable(element: HostElement): boolean {
    const { tabIndex } = element.props;
    if (typeof tabIndex === 'number') return tabIndex >= 0;
    if (element.tag === 'a') return typeof element.props['href'] === 'string';
    return PackageControls.isControl(element) && element.props['disabled'] !== true;
  },

  /** The name a reader hears: the label Gaia set or handed a package part, or else the text. */
  nameOf(element: HostElement): string {
    const named = [element.props['aria-label'], element.props['accessibleName'], element.props['label']].find((name) => typeof name === 'string');
    return typeof named === 'string' ? named : ReactElementTree.textOf([element]);
  },
} as const;
