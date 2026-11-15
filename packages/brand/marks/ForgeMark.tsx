/**
 * Forge's mark: a tile with Forge's hexagon ring, opened at the top right where the orange node sits, around a hexagon core. It is an
 * image named for the brand; a host may give it a title and an action on a double click.
 */
import { MARK_GEOMETRY } from '../constants/MarkGeometry.ts';

const DEFAULT_SIZE_PIXELS = 22;

const ACCESSIBLE_NAME = 'Forge';

const HEXAGON_CORE_PATH = 'M31.5 25.89 A1 1 0 0 1 32.5 25.89 L37.04 28.51 A1 1 0 0 1 37.54 29.38 L37.54 34.62 A1 1 0 0 1 37.04 35.49 '
  + 'L32.5 38.11 A1 1 0 0 1 31.5 38.11 L26.96 35.49 A1 1 0 0 1 26.46 34.62 L26.46 29.38 A1 1 0 0 1 26.96 28.51 Z';

export interface ForgeMarkProps {
  readonly sizePixels?:    number;
  readonly title?:         string;
  readonly onDoubleClick?: () => void;
}

export function ForgeMark({ sizePixels = DEFAULT_SIZE_PIXELS, title, onDoubleClick }: ForgeMarkProps) {
  return (
    <svg className="brand-forge-mark" role="img" aria-label={ACCESSIBLE_NAME} width={sizePixels} height={sizePixels} viewBox="0 0 64 64" onDoubleClick={onDoubleClick}>
      {title === undefined ? null : <title>{title}</title>}
      <defs>
        <linearGradient id="brand-forge-mark-ground" x1="0" y1="0" x2="1" y2="1">
          <stop className="brand-forge-mark-ground-from" offset="0" />
          <stop className="brand-forge-mark-ground-to" offset="1" />
        </linearGradient>
        <mask id="brand-forge-mark-gap" maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64">
          <rect className="brand-forge-mark-mask-open" width="64" height="64" />
          <circle className="brand-forge-mark-mask-shut" cx="48.02" cy="22.75" r="10.9" />
        </mask>
      </defs>
      <rect x="1" y="1" width="62" height="62" rx="13" fill="url(#brand-forge-mark-ground)" />
      <g transform={MARK_GEOMETRY.scaleAboutCentreTransform}>
        <g mask="url(#brand-forge-mark-gap)">
          <path className="brand-forge-mark-ring" d={MARK_GEOMETRY.hexagonRingPath} fill="none" strokeWidth="5" />
        </g>
        <path className="brand-forge-mark-core" d={HEXAGON_CORE_PATH} />
        <circle className="brand-forge-mark-node-ring" cx="48.02" cy="22.75" r="7.4" fill="none" strokeWidth="2.6" />
        <circle className="brand-forge-mark-node-core" cx="48.02" cy="22.75" r="3.4" />
      </g>
      <rect className="brand-forge-mark-rim" x="1.5" y="1.5" width="61" height="61" rx="12.5" fill="none" />
    </svg>
  );
}
