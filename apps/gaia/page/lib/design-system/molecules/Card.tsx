/**
 * A preconfigured View: the card ground, border, radius and padding as defaults that every View prop a caller passes overrides. The
 * ground flags `quiet`, `step` and `decision` exclude each other in the props type; `dashed`, `interactive`, `selected` and `highlighted`
 * combine with any of them, and `grow` lets the card take the room its holder leaves. `radius` picks the section or the step corner,
 * `clipped` cuts what runs edge to edge at the corners, and `washes` washes the card in the tint of the tone around it once. A `title`
 * is drawn in the title role at the card's head, spaced from the children as they are from each other, and carries `titleId` so a
 * region can be named by it; with no title nothing is drawn, and the children may hold a title of their own.
 */
import { Text, type TextElement } from '../atoms/Text.tsx';
import { View, type ViewProps }   from '../atoms/View.tsx';
import { SpacingStyleUtil }       from '../utils/SpacingStyleUtil.ts';

type GroundFlag = 'quiet' | 'step' | 'decision';
type OnlyGround<Flag extends GroundFlag> = { readonly [Name in Flag]?: boolean } & { readonly [Name in Exclude<GroundFlag, Flag>]?: never };

/** The lane ground with no border (`quiet`), a step card (`step`), or what waits on User (`decision`). */
export type CardGround = OnlyGround<'quiet'> | OnlyGround<'step'> | OnlyGround<'decision'>;

/** A title's id names the title Card draws, so only a card with a title takes one. */
type CardTitleId = { readonly title: string; readonly titleId?: string } | { readonly title?: undefined; readonly titleId?: never };

export type CardProps = ViewProps & CardGround & CardTitleId & {
  readonly dashed?:       boolean;
  /** The hover ring of a card that opens something. */
  readonly interactive?:  boolean;
  readonly selected?:     boolean;
  /** The orange tint and edge of what waits on User, on any ground. */
  readonly highlighted?:  boolean;
  /** The corner: `section` (the default) or the smaller `step` one, on any ground. */
  readonly radius?:       'section' | 'step';
  /** Cuts rows that run edge to edge at the card's corners. */
  readonly clipped?:      boolean;
  /** Washes in the tint of the nearest state tone around it once, as it renders. */
  readonly washes?:       boolean;
  readonly title?:        string;
  /** The title's element: a heading level where the card heads a part of the page; a span by default. */
  readonly titleElement?: TextElement;
};

const DEFAULT_TITLE_GAP = 'eight';

const flagAttribute = (isSet: boolean | undefined) => (isSet === true ? '' : undefined);

/** The props the inner View lays the children out by; the frame takes the padding and the margin. */
function layoutPropsOf(props: CardProps): ViewProps {
  const {
    padding, paddingHorizontal, paddingVertical, paddingTop, paddingBottom, paddingLeft, paddingRight,
    margin, marginHorizontal, marginVertical, marginTop, marginBottom, marginLeft, marginRight,
    quiet, step, decision, dashed, interactive, selected, highlighted, radius, clipped, washes, grow, title, titleElement, titleId, children,
    ...layoutProps
  } = props;
  return layoutProps;
}

export function Card(props: CardProps) {
  const {
    title, titleElement = 'span', titleId, children, gap
  } = props;
  const ground = props.quiet === true ? 'quiet' : props.step === true ? 'step' : props.decision === true ? 'decision' : undefined;
  const frameStyle = { ...SpacingStyleUtil.paddingStyleOf(props), ...SpacingStyleUtil.marginStyleOf(props) };
  return (
    <div
      className="design-system-card"
      data-ground={ground}
      data-dashed={flagAttribute(props.dashed)}
      data-interactive={flagAttribute(props.interactive)}
      data-selected={flagAttribute(props.selected)}
      data-highlighted={flagAttribute(props.highlighted)}
      data-radius={props.radius === 'step' ? 'step' : undefined}
      data-clipped={flagAttribute(props.clipped)}
      data-washes={flagAttribute(props.washes)}
      data-grow={flagAttribute(props.grow)}
      style={frameStyle}
    >
      {title === undefined ? null : (
        <Text typeRole="title" element={titleElement} {...(titleId === undefined ? {} : { id: titleId })} marginBottom={gap ?? DEFAULT_TITLE_GAP}>
          {title}
        </Text>
      )}
      <View {...layoutPropsOf(props)}>{children}</View>
    </div>
  );
}
