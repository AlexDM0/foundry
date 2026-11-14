/**
 * The fresh shimmer Lay the bar along leaves over the host's bar, as page shapes in overlay units: from the bar's left end to just behind
 * Flint, with the part nearest Flint in the body colour. A part fades out as it ages since Flint passed it, so the shimmer is drawn as a few
 * segments, each with the opacity of the age at its middle; its two ends are rounded.
 */
import { MILLISECONDS_PER_SECOND } from '../../constants/Easing.ts';
import type { FlintColourRole }    from '../../constants/Palette.ts';
import type { Shape }              from '../../drawing/Shape.ts';
import { SvgTextUtil }             from '../../drawing/SvgTextUtil.ts';
import { AnimationCurveUtil }      from '../../utils/AnimationCurveUtil.ts';
import { LAY_BAR_ALONG_SHIMMER }   from './constants/LayBarAlongValues.ts';

/** Where the lay is at one moment: the bar's left end, Flint's x, the bar's height, and when and how fast the lay passes each point. */
export interface ShimmerMoment {
  readonly leftX:                  number;
  readonly flintX:                 number;
  readonly topY:                   number;
  readonly bottomY:                number;
  readonly layStartedMilliseconds: number;
  readonly speedUnitsPerSecond:    number;
  readonly nowMilliseconds:        number;
}

interface ShimmerPiece {
  readonly key:         string;
  readonly leftX:       number;
  readonly rightX:      number;
  readonly roundsLeft:  boolean;
  readonly roundsRight: boolean;
  readonly fill:        FlintColourRole;
  readonly opacity:     number;
}

/** A bar between two x, flat at an end it shares with another piece, rounded at an end of the whole shimmer. */
function piecePathOf(piece: ShimmerPiece, topY: number, bottomY: number): string {
  const { numberText } = SvgTextUtil;
  const ends = (piece.roundsLeft ? 1 : 0) + (piece.roundsRight ? 1 : 0);
  const radius = Math.min(LAY_BAR_ALONG_SHIMMER.CORNER_RADIUS_UNITS, (bottomY - topY) / 2, ends === 0 ? 0 : (piece.rightX - piece.leftX) / ends);
  const leftInset = piece.roundsLeft ? radius : 0;
  const rightInset = piece.roundsRight ? radius : 0;
  const corner = (toX: number, toY: number): string => `A${numberText(radius)} ${numberText(radius)} 0 0 1 ${numberText(toX)} ${numberText(toY)}`;
  return [
    `M${numberText(piece.leftX + leftInset)} ${numberText(topY)}`,
    `H${numberText(piece.rightX - rightInset)}`,
    ...(piece.roundsRight ? [corner(piece.rightX, topY + radius), `V${numberText(bottomY - radius)}`, corner(piece.rightX - radius, bottomY)] : [`V${numberText(bottomY)}`]),
    `H${numberText(piece.leftX + leftInset)}`,
    ...(piece.roundsLeft ? [corner(piece.leftX, bottomY - radius), `V${numberText(topY + radius)}`, corner(piece.leftX + radius, topY)] : [`V${numberText(topY)}`]),
    'Z',
  ].join(' ');
}

/** How long ago Flint passed a point of the bar. */
function ageAt(moment: ShimmerMoment, pointX: number): number {
  return moment.nowMilliseconds - moment.layStartedMilliseconds - ((pointX - moment.leftX) / moment.speedUnitsPerSecond * MILLISECONDS_PER_SECOND);
}

function freshnessAt(moment: ShimmerMoment, pointX: number): number {
  return 1 - AnimationCurveUtil.clamp(ageAt(moment, pointX) / LAY_BAR_ALONG_SHIMMER.FADES_AFTER_MILLISECONDS);
}

/** The shimmer at a moment; none until Flint is far enough along for any of it to lie behind it. */
function shimmerShapesAt(moment: ShimmerMoment): readonly Shape[] {
  const sinceTheTailFadedMilliseconds = moment.nowMilliseconds - moment.layStartedMilliseconds - LAY_BAR_ALONG_SHIMMER.FADES_AFTER_MILLISECONDS;
  const fadedX = moment.leftX + (moment.speedUnitsPerSecond * sinceTheTailFadedMilliseconds / MILLISECONDS_PER_SECOND);
  const tailX = Math.max(moment.leftX, fadedX);
  const headX = moment.flintX - LAY_BAR_ALONG_SHIMMER.BEHIND_FLINT_UNITS;
  if (headX <= tailX) return [];
  const headStartX = Math.max(tailX, headX - LAY_BAR_ALONG_SHIMMER.HEAD_LENGTH_UNITS);
  const tailIsTheBarsEnd = tailX === moment.leftX;
  const segmentLength = (headStartX - tailX) / LAY_BAR_ALONG_SHIMMER.SEGMENT_COUNT;
  const segments: ShimmerPiece[] = segmentLength <= 0
    ? []
    : Array.from({ length: LAY_BAR_ALONG_SHIMMER.SEGMENT_COUNT }, (_unused, i) => {
      const leftX = tailX + (i * segmentLength);
      return {
        key:         `segment-${i}`,
        leftX,
        rightX:      leftX + segmentLength,
        roundsLeft:  i === 0 && tailIsTheBarsEnd,
        roundsRight: false,
        fill:        'emberLight',
        opacity:     LAY_BAR_ALONG_SHIMMER.OPACITY * freshnessAt(moment, leftX + (segmentLength / 2)),
      };
    });
  const head: ShimmerPiece = {
    key:         'head',
    leftX:       headStartX,
    rightX:      headX,
    roundsLeft:  segments.length === 0 && tailIsTheBarsEnd,
    roundsRight: true,
    fill:        'body',
    opacity:     LAY_BAR_ALONG_SHIMMER.HEAD_OPACITY * freshnessAt(moment, (headStartX + headX) / 2),
  };
  return [...segments, head].map((piece): Shape => ({
    kind: 'path', key: piece.key, pathData: piecePathOf(piece, moment.topY, moment.bottomY), fill: piece.fill, opacity: piece.opacity,
  }));
}

export const ShimmerShapeUtil = Object.freeze({ shimmerShapesAt, ageAt });
