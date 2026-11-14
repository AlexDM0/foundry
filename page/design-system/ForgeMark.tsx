/**
 * Forge's mark beside a forge's name in B1's bar (COMPONENT_LIBRARY 3.1): Gaia's tile with Forge's hexagon ring, opened at the top right
 * where the orange node sits, around a hexagon core. It is an image named "Forge"; a double-click may wake the forge's brain, as SCREENS
 * B1 draws it, and a title may say so.
 */
const DEFAULT_SIZE_PIXELS = 22;

const ACCESSIBLE_NAME = 'Forge';

const HEXAGON_RING_PATH = 'M30.75 14.22 A2.5 2.5 0 0 1 33.25 14.22 L46.77 22.03 A2.5 2.5 0 0 1 48.02 24.19 L48.02 39.81 A2.5 2.5 0 0 1 46.77 41.97 '
  + 'L33.25 49.78 A2.5 2.5 0 0 1 30.75 49.78 L17.23 41.97 A2.5 2.5 0 0 1 15.98 39.81 L15.98 24.19 A2.5 2.5 0 0 1 17.23 22.03 Z';

const HEXAGON_CORE_PATH = 'M31.5 25.89 A1 1 0 0 1 32.5 25.89 L37.04 28.51 A1 1 0 0 1 37.54 29.38 L37.54 34.62 A1 1 0 0 1 37.04 35.49 '
  + 'L32.5 38.11 A1 1 0 0 1 31.5 38.11 L26.96 35.49 A1 1 0 0 1 26.46 34.62 L26.46 29.38 A1 1 0 0 1 26.96 28.51 Z';

export interface ForgeMarkProps {
  readonly sizePixels?:    number;
  readonly title?:         string;
  readonly onDoubleClick?: () => void;
}

export function ForgeMark({ sizePixels = DEFAULT_SIZE_PIXELS, title, onDoubleClick }: ForgeMarkProps) {
  return (
    <svg className="gaia-mark" role="img" aria-label={ACCESSIBLE_NAME} width={sizePixels} height={sizePixels} viewBox="0 0 64 64" onDoubleClick={onDoubleClick}>
      {title === undefined ? null : <title>{title}</title>}
      <defs>
        <linearGradient id="gaia-forge-mark-ground" x1="0" y1="0" x2="1" y2="1">
          <stop className="gaia-mark-ground-from" offset="0" />
          <stop className="gaia-mark-ground-to" offset="1" />
        </linearGradient>
        <mask id="gaia-forge-mark-gap" maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64">
          <rect className="gaia-mark-mask-open" width="64" height="64" />
          <circle className="gaia-mark-mask-shut" cx="48.02" cy="22.75" r="10.9" />
        </mask>
      </defs>
      <rect x="1" y="1" width="62" height="62" rx="13" fill="url(#gaia-forge-mark-ground)" />
      <g transform="translate(32 32) scale(1.1) translate(-32 -32)">
        <g mask="url(#gaia-forge-mark-gap)">
          <path className="gaia-forge-mark-ring" d={HEXAGON_RING_PATH} fill="none" strokeWidth="5" />
        </g>
        <path className="gaia-forge-mark-core" d={HEXAGON_CORE_PATH} />
        <circle className="gaia-forge-mark-node-ring" cx="48.02" cy="22.75" r="7.4" fill="none" strokeWidth="2.6" />
        <circle className="gaia-forge-mark-node-core" cx="48.02" cy="22.75" r="3.4" />
      </g>
      <rect className="gaia-mark-rim" x="1.5" y="1.5" width="61" height="61" rx="12.5" fill="none" />
    </svg>
  );
}
