/**
 * Test-only: reads back which condition or role a drawn dot shows, from the package's state dot (its tone and shape) or Gaia's own crimson
 * dot and brain diamond, so a view's spec can still claim "the dots read live, live, held" after the dots moved onto the package.
 */
import { CONDITION_LOOKS, type DotCondition } from '../design-system/ConditionDot.tsx';
import { type DotRole, ROLE_LOOKS }           from '../design-system/RoleDot.tsx';
import { type HostElement, ReactElementTree } from './ReactElementTree.ts';

const SOLID_SHAPE = 'solid';

function lookKeyOf(tone: unknown, shape: unknown): string {
  return `${String(tone)}/${typeof shape === 'string' ? shape : SOLID_SHAPE}`;
}

export const DrawnDots = {
  /** Whether an element is a condition or role mark: the package's state dot, Gaia's crimson dot or the brain diamond. */
  isDot(element: HostElement): boolean {
    return ['design-system-state-dot', 'gaia-condition-dot', 'gaia-brain-diamond'].some((className) => ReactElementTree.hasClass(element, className));
  },

  /** The conditions whose look this dot draws; the dormant and unreadable looks differ, but unreadable and missing share one. */
  conditionsOf(element: HostElement): DotCondition[] {
    if (ReactElementTree.hasClass(element, 'gaia-condition-dot')) return [element.props['data-condition'] as DotCondition];
    const key = lookKeyOf(element.props['data-state-tone'], element.props['data-shape']);
    return Object.entries(CONDITION_LOOKS).filter(([, look]) => lookKeyOf(look.tone, look.shape) === key).map(([condition]) => condition as DotCondition);
  },

  /** The condition this dot draws, or, where conditions share a look as unreadable and missing do, each of them joined by a bar. */
  conditionOf(element: HostElement): string {
    return DrawnDots.conditionsOf(element).join('|');
  },

  roleOf(element: HostElement): DotRole | null {
    if (ReactElementTree.hasClass(element, 'gaia-brain-diamond')) return 'brain';
    const key = lookKeyOf(element.props['data-state-tone'], element.props['data-shape']);
    const [role] = Object.entries(ROLE_LOOKS).filter(([, look]) => lookKeyOf(look.tone, look.shape) === key).map(([name]) => name as DotRole);
    return role ?? null;
  },
} as const;
