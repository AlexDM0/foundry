/**
 * Gaia's mark, the constellation: a tile holding a rounded hexagon ring, opened around three nodes, about a hexagon core, drawn on a
 * 64-unit grid in the mark's tokens of each theme. Small, it draws a thicker ring and solid nodes with no halo or glow. It is decoration;
 * the link or the name beside it carries the meaning. Every mark of one drawing draws the same gradient, mask and filter, so one id for each
 * serves them all, and each drawing keeps ids of its own.
 */
import { Fragment } from 'react';

import { MARK_GEOMETRY } from './constants/MarkGeometry.ts';

const DEFAULT_SIZE_PIXELS = 28;

/** Below this size the large drawing's thin ring and translucent halos blur into the tile, while the small drawing's solid nodes still read. */
export const SMALL_DRAWING_BELOW_SIZE_PIXELS = 24;

const LARGE_CORE_PATH = 'M31.50 26.29 A1.0 1.0 0 0 1 32.50 26.29 L36.70 28.71 A1.0 1.0 0 0 1 37.20 29.58 L37.20 34.42 A1.0 1.0 0 0 1 36.70 35.29 '
  + 'L32.50 37.71 A1.0 1.0 0 0 1 31.50 37.71 L27.30 35.29 A1.0 1.0 0 0 1 26.80 34.42 L26.80 29.58 A1.0 1.0 0 0 1 27.30 28.71 Z';

const SMALL_CORE_PATH = 'M31.50 25.69 A1.0 1.0 0 0 1 32.50 25.69 L37.22 28.41 A1.0 1.0 0 0 1 37.72 29.28 L37.72 34.72 A1.0 1.0 0 0 1 37.22 35.59 '
  + 'L32.50 38.31 A1.0 1.0 0 0 1 31.50 38.31 L26.78 35.59 A1.0 1.0 0 0 1 26.28 34.72 L26.28 29.28 A1.0 1.0 0 0 1 26.78 28.41 Z';

/** The halo's fill and the glow's whole circle are this translucent, so the tile shows through them. */
const HALO_FILL_OPACITY = '0.22';
const GLOW_OPACITY = '0.22';
const GLOW_BLUR_UNITS = '2';

interface NodeCentre {
  readonly centreX: string;
  readonly centreY: string;
}

/** The top left node, the one that glows; then the right node and the bottom one. */
const NODE_CENTRES = {
  topLeft:    { centreX: '15.98', centreY: '22.75' },
  right:      { centreX: '48.02', centreY: '41.25' },
  bottomLeft: { centreX: '23.99', centreY: '45.88' },
} as const satisfies Record<string, NodeCentre>;

interface LargeNode extends NodeCentre {
  readonly gapRadius:       string;
  readonly haloRadius:      string;
  readonly haloStrokeWidth: string;
  readonly coreRadius:      string;
}

interface SmallNode extends NodeCentre {
  readonly gapRadius:  string;
  readonly coreRadius: string;
}

const LARGE_NODES: readonly LargeNode[] = [
  {
    ...NODE_CENTRES.topLeft,
    gapRadius:       '9.00',
    haloRadius:      '6.4',
    haloStrokeWidth: '1.5',
    coreRadius:      '3.4',
  },
  {
    ...NODE_CENTRES.right,
    gapRadius:       '8.60',
    haloRadius:      '6.0',
    haloStrokeWidth: '1.25',
    coreRadius:      '3.2',
  },
  {
    ...NODE_CENTRES.bottomLeft,
    gapRadius:       '6.80',
    haloRadius:      '4.4',
    haloStrokeWidth: '1.25',
    coreRadius:      '2.3',
  },
];

const SMALL_NODES: readonly SmallNode[] = [
  { ...NODE_CENTRES.topLeft, gapRadius: '8.55', coreRadius: '5.95' },
  { ...NODE_CENTRES.right, gapRadius: '8.20', coreRadius: '5.60' },
  { ...NODE_CENTRES.bottomLeft, gapRadius: '6.62', coreRadius: '4.02' },
];

const GLOW = { ...NODE_CENTRES.topLeft, radius: '5.5' } as const;

const LARGE_IDS = { ground: 'gaia-mark-large-ground', gap: 'gaia-mark-large-gap', glow: 'gaia-mark-large-glow' } as const;
const SMALL_IDS = { ground: 'gaia-mark-small-ground', gap: 'gaia-mark-small-gap' } as const;

export type GaiaMarkDrawing = 'small' | 'large';

export interface GaiaMarkProps {
  /** 28 in the brand bar and a notification, 22 in the window bar, 88 on the splash, 128 and 64 for the app icon. */
  readonly sizePixels?: number;
}

function gaiaMarkDrawingAt(sizePixels: number): GaiaMarkDrawing {
  return sizePixels < SMALL_DRAWING_BELOW_SIZE_PIXELS ? 'small' : 'large';
}

function TileGround({ id }: { readonly id: string }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
      <stop className="gaia-mark-ground-from" offset="0" />
      <stop className="gaia-mark-ground-to" offset="1" />
    </linearGradient>
  );
}

function NodeGap({ id, nodes }: { readonly id: string; readonly nodes: readonly (NodeCentre & { readonly gapRadius: string })[] }) {
  return (
    <mask id={id} maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64">
      <rect className="gaia-mark-mask-open" width="64" height="64" />
      {nodes.map((node) => <circle key={node.centreX} className="gaia-mark-mask-shut" cx={node.centreX} cy={node.centreY} r={node.gapRadius} />)}
    </mask>
  );
}

function LargeConstellation() {
  return (
    <>
      <defs>
        <TileGround id={LARGE_IDS.ground} />
        <filter id={LARGE_IDS.glow} filterUnits="userSpaceOnUse" x="-0.02" y="6.75" width="32" height="32">
          <feGaussianBlur stdDeviation={GLOW_BLUR_UNITS} />
        </filter>
        <NodeGap id={LARGE_IDS.gap} nodes={LARGE_NODES} />
      </defs>
      <rect x="1" y="1" width="62" height="62" rx="13" fill={`url(#${LARGE_IDS.ground})`} />
      <g transform={MARK_GEOMETRY.scaleAboutCentreTransform}>
        <g mask={`url(#${LARGE_IDS.gap})`}>
          <path className="gaia-mark-ring" d={MARK_GEOMETRY.hexagonRingPath} fill="none" strokeWidth="3" />
        </g>
        <path className="gaia-mark-core" d={LARGE_CORE_PATH} />
        <circle className="gaia-mark-glow" cx={GLOW.centreX} cy={GLOW.centreY} r={GLOW.radius} opacity={GLOW_OPACITY} filter={`url(#${LARGE_IDS.glow})`} />
        {LARGE_NODES.map((node) => (
          <Fragment key={node.centreX}>
            <circle className="gaia-mark-node-halo" cx={node.centreX} cy={node.centreY} r={node.haloRadius} fillOpacity={HALO_FILL_OPACITY} strokeWidth={node.haloStrokeWidth} />
            <circle className="gaia-mark-node-core" cx={node.centreX} cy={node.centreY} r={node.coreRadius} />
          </Fragment>
        ))}
      </g>
    </>
  );
}

function SmallConstellation() {
  return (
    <>
      <defs>
        <TileGround id={SMALL_IDS.ground} />
        <NodeGap id={SMALL_IDS.gap} nodes={SMALL_NODES} />
      </defs>
      <rect x="1" y="1" width="62" height="62" rx="13" fill={`url(#${SMALL_IDS.ground})`} />
      <g transform={MARK_GEOMETRY.scaleAboutCentreTransform}>
        <g mask={`url(#${SMALL_IDS.gap})`}>
          <path className="gaia-mark-ring" d={MARK_GEOMETRY.hexagonRingPath} fill="none" strokeWidth="5.8" />
        </g>
        <path className="gaia-mark-core" d={SMALL_CORE_PATH} />
        {SMALL_NODES.map((node) => <circle key={node.centreX} className="gaia-mark-node-core" cx={node.centreX} cy={node.centreY} r={node.coreRadius} />)}
      </g>
    </>
  );
}

export function GaiaMark({ sizePixels = DEFAULT_SIZE_PIXELS }: GaiaMarkProps) {
  const drawing = gaiaMarkDrawingAt(sizePixels);
  return (
    <svg className="gaia-mark" data-drawing={drawing} aria-hidden="true" width={sizePixels} height={sizePixels} viewBox="0 0 64 64">
      {drawing === 'small' ? <SmallConstellation /> : <LargeConstellation />}
      <rect className="gaia-mark-rim" x="1.5" y="1.5" width="61" height="61" rx="12.5" fill="none" />
    </svg>
  );
}
