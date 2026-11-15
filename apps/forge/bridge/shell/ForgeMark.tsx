/**
 * The Forge mark at the start of the header's title row: a rounded square on a gradient ground holding the hexagon frame, its core and the
 * spark in the frame's gap. Its colours are the `--forge-mark-*` tokens, so the one drawing shows the light mark or the dark one as the
 * active theme does.
 */
import { useId } from 'react';

const FORGE_MARK_SIDE_PIXELS = 28;

const HEXAGON_FRAME_PATH = 'M30.75 14.22 A2.5 2.5 0 0 1 33.25 14.22 L46.77 22.03 A2.5 2.5 0 0 1 48.02 24.19 L48.02 39.81 A2.5 2.5 0 0 1 46.77 41.97 '
  + 'L33.25 49.78 A2.5 2.5 0 0 1 30.75 49.78 L17.23 41.97 A2.5 2.5 0 0 1 15.98 39.81 L15.98 24.19 A2.5 2.5 0 0 1 17.23 22.03 Z';

const HEXAGON_CORE_PATH = 'M31.5 25.89 A1 1 0 0 1 32.5 25.89 L37.04 28.51 A1 1 0 0 1 37.54 29.38 L37.54 34.62 A1 1 0 0 1 37.04 35.49 L32.5 38.11 '
  + 'A1 1 0 0 1 31.5 38.11 L26.96 35.49 A1 1 0 0 1 26.46 34.62 L26.46 29.38 A1 1 0 0 1 26.96 28.51 Z';

/** The whole square less a disc around the spark: the frame is cut where the spark's ring sits. */
const FRAME_GAP_CLIP_PATH = 'M0 0 H64 V64 H0 Z M37.12 22.75 A10.9 10.9 0 1 0 58.92 22.75 A10.9 10.9 0 1 0 37.12 22.75 Z';

export function ForgeMark() {
  const markId = useId();
  const groundId = `${markId}forge-mark-ground`;
  const gapId = `${markId}forge-mark-gap`;
  return (
    <svg className="bridge-forge-mark" viewBox="0 0 64 64" width={FORGE_MARK_SIDE_PIXELS} height={FORGE_MARK_SIDE_PIXELS} aria-hidden="true">
      <defs>
        <linearGradient id={groundId} x1="0" y1="0" x2="1" y2="1">
          <stop className="bridge-forge-mark-ground-start" offset="0" />
          <stop className="bridge-forge-mark-ground-end" offset="1" />
        </linearGradient>
        <clipPath id={gapId} clipPathUnits="userSpaceOnUse">
          <path d={FRAME_GAP_CLIP_PATH} clipRule="evenodd" />
        </clipPath>
      </defs>
      <rect x="1" y="1" width="62" height="62" rx="13" fill={`url(#${groundId})`} />
      <g transform="translate(32 32) scale(1.1) translate(-32 -32)">
        <path className="bridge-forge-mark-frame" d={HEXAGON_FRAME_PATH} clipPath={`url(#${gapId})`} />
        <path className="bridge-forge-mark-core" d={HEXAGON_CORE_PATH} />
        <circle className="bridge-forge-mark-ring" cx="48.02" cy="22.75" r="7.4" />
        <circle className="bridge-forge-mark-spark" cx="48.02" cy="22.75" r="3.4" />
      </g>
      <rect className="bridge-forge-mark-rim" x="1.5" y="1.5" width="61" height="61" rx="12.5" />
    </svg>
  );
}
