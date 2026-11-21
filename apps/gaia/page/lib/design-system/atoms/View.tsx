/**
 * The layout primitive: a flex box, a column unless `row` is set, aligned by adjective flags and spaced by steps of the spacing scale. The
 * flags that pull one axis two ways exclude each other in the props type: `centered` stands alone, and `between` spreads the main axis,
 * so it takes centring only across it (`centerX` in a column, `centerY` in a row). `divider` draws a hairline between the children, and
 * `grow` makes the view take the room its own row or column leaves.
 */
import { Children, type ReactNode } from 'react';

import type { SpacingStep }                                      from '../constants/Spacing.ts';
import { SpacingStyleUtil, type MarginProps, type PaddingProps } from '../utils/SpacingStyleUtil.ts';

type AlignmentFlag = 'centered' | 'centerX' | 'centerY' | 'between';
type Excluded<Flag extends AlignmentFlag> = { readonly [Name in Flag]?: never };

type CenteredAlignment = { readonly centered?: boolean } & Excluded<'centerX' | 'centerY' | 'between'>;
type AxisAlignment = { readonly centerX?: boolean; readonly centerY?: boolean } & Excluded<'centered' | 'between'>;
type ColumnSpreadAlignment = { readonly between?: boolean; readonly centerX?: boolean } & Excluded<'centered' | 'centerY'>;
type RowSpreadAlignment = { readonly between?: boolean; readonly centerY?: boolean } & Excluded<'centered' | 'centerX'>;

export type ColumnAlignment = CenteredAlignment | AxisAlignment | ColumnSpreadAlignment;
export type RowAlignment = CenteredAlignment | AxisAlignment | RowSpreadAlignment;

/** What a View holds and how it spaces it, whatever its direction. */
export interface ViewContentProps extends PaddingProps, MarginProps {
  readonly gap?:      SpacingStep;
  readonly wrap?:     boolean;
  readonly divider?:  boolean;
  /** Takes the room the row or column holding it leaves, from a start of nothing. */
  readonly grow?:     boolean;
  readonly children?: ReactNode;
}

export type ViewProps = ViewContentProps & (({ readonly row?: false } & ColumnAlignment) | ({ readonly row: true } & RowAlignment));

interface AlignmentFlags {
  readonly row?:      boolean;
  readonly centered?: boolean;
  readonly centerX?:  boolean;
  readonly centerY?:  boolean;
  readonly between?:  boolean;
}

/** The main axis's distribution and the cross axis's alignment the flags ask for, as the stylesheet's `data-justify` and `data-align`. */
function alignmentAttributesOf({
  row = false, centered = false, centerX = false, centerY = false, between = false
}: AlignmentFlags) {
  const centersMainAxis = centered || (row ? centerX : centerY);
  const centersCrossAxis = centered || (row ? centerY : centerX);
  const justify = between ? 'between' : centersMainAxis ? 'center' : undefined;
  return { 'data-justify': justify, 'data-align': centersCrossAxis ? 'center' : undefined };
}

/** The children with a hairline between each two of them; a `null` or `false` child is no child. */
function childrenWithDividers(children: ReactNode): ReactNode {
  return Children.toArray(children).flatMap((child, i) => (i === 0
    ? [child]
    : [<span key={`design-system-view-divider-${i}`} className="design-system-view-divider" aria-hidden="true" />, child]));
}

export function View(props: ViewProps) {
  const {
    gap, wrap = false, divider = false, grow = false, row = false, children
  } = props;
  const style = {
    ...SpacingStyleUtil.gapStyleOf(gap),
    ...SpacingStyleUtil.paddingStyleOf(props),
    ...SpacingStyleUtil.marginStyleOf(props),
  };
  return (
    <div
      className="design-system-view"
      data-row={row ? '' : undefined}
      data-wrap={wrap ? '' : undefined}
      data-grow={grow ? '' : undefined}
      {...alignmentAttributesOf(props)}
      style={style}
    >
      {divider ? childrenWithDividers(children) : children}
    </div>
  );
}
