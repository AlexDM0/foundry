/**
 * The messages between the page and a diagram frame, the sandboxed frame that draws one mermaid block. Every message both ways carries the
 * protocol's name and version; either side drops a message of another protocol or version, and the page takes one only from its own frame.
 */
import type { PAGE_CONTRACT_VERSIONS } from '../../../src/shared/constants/PageContractVersions.ts';

export const DIAGRAM_FRAME_PROTOCOL = 'gaia-diagram-frame';

export interface DiagramFrameMessageHead {
  readonly protocol:        typeof DIAGRAM_FRAME_PROTOCOL;
  readonly protocolVersion: typeof PAGE_CONTRACT_VERSIONS.gaiaDiagramFrame;
}

/** The mermaid source to draw, with the board's colour tokens of the current theme as mermaid's theme variables. */
export type DiagramFrameRequest = DiagramFrameMessageHead & {
  readonly kind:           'render';
  readonly source:         string;
  readonly themeVariables: Readonly<Record<string, string>>;
};

export interface DiagramNode {
  readonly nodeId: string;
  readonly label:  string;
}

/** A hovered node's place is in the frame's own pixels, from its top left corner. */
export type DiagramFrameAnswer = DiagramFrameMessageHead & (
  | { readonly kind: 'rendered'; readonly heightPixels: number; readonly nodes: readonly DiagramNode[] }
  | { readonly kind: 'node-hovered'; readonly nodeId: string; readonly top: number; readonly left: number }
  | { readonly kind: 'node-left' }
  | { readonly kind: 'render-failed'; readonly reason: string }
);
