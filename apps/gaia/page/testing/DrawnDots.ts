/**
 * Test-only: reads back which condition or role a drawn dot shows, from the tone and shape Gaia hands the package's state dot, kept folded,
 * so a view's spec can still claim "the dots read live, live, held".
 */

import { CONDITION_LOOKS, type DotCondition } from '../components/ConditionDot.tsx';
import { type DotRole, ROLE_LOOKS }           from '../components/RoleDot.tsx';
import { StateDot }                           from '../lib/design-system/DesignSystemInterface.ts';
import { type HostElement, ReactElementTree } from './ReactElementTree.ts';

/** The package's state dot is solid unless it is given a shape. */
const SOLID_SHAPE = 'solid';

function lookKeyOf(tone: unknown, shape: unknown): string {
  return `${String(tone)}/${typeof shape === 'string' ? shape : SOLID_SHAPE}`;
}

export const DrawnDots = {
  /** Whether an element is a condition or role mark: the package's state dot. */
  isDot(element: HostElement): boolean {
    return ReactElementTree.withComponent(StateDot)(element);
  },

  /** The conditions whose look this dot draws; the dormant and unreadable looks differ, but unreadable and missing share one, as held and outdated do. */
  conditionsOf(element: HostElement): DotCondition[] {
    const key = lookKeyOf(element.props['tone'], element.props['shape']);
    return Object.entries(CONDITION_LOOKS).filter(([, look]) => lookKeyOf(look.tone, look.shape) === key).map(([condition]) => condition as DotCondition);
  },

  /** The condition this dot draws, or, where conditions share a look as unreadable and missing do, each of them joined by a bar. */
  conditionOf(element: HostElement): string {
    return DrawnDots.conditionsOf(element).join('|');
  },

  roleOf(element: HostElement): DotRole | null {
    const key = lookKeyOf(element.props['tone'], element.props['shape']);
    const [role] = Object.entries(ROLE_LOOKS).filter(([, look]) => lookKeyOf(look.tone, look.shape) === key).map(([name]) => name as DotRole);
    return role ?? null;
  },
} as const;
