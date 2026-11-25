/**
 * One mermaid block, drawn by Gaia's diagram frame: a sandboxed frame of an opaque origin (`allow-scripts` alone), which reaches neither
 * this page, its cookies nor Gaia's API. Once it loads, the page hands it the source and the board's colour tokens of the current theme as
 * mermaid's theme variables, with `darkMode` for the dark theme, again when the theme changes, and takes a message only from its own frame,
 * of the frame protocol's name and version. The frame answers with its height and its nodes, and with the node under the pointer, which
 * offers a comment on the node's line until a moment after the pointer left it, unless it went to the offer, or until the diagram is drawn
 * again. A diagram that fails to draw shows its source as text.
 */
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState
} from 'react';

import { PAGE_CONTRACT_VERSIONS } from '../../../../src/shared/constants/PageContractVersions.ts';
import {
  DIAGRAM_FRAME_PROTOCOL,
  type DiagramFrameAnswer,
  type DiagramFrameRequest,
  type DiagramNode
} from '../../../shared/@types/DiagramFrameMessages.ts';
import { useBoardClock } from '../../shell/BoardClock.ts';

export const DIAGRAM_FRAME_ADDRESS = '/diagram-frame/';

/** Where the frame loads from; a DOM spec, which opens no diagram frame, hands `null` and the frame stays empty. */
export const DiagramFrameAddressContext = createContext<string | null>(DIAGRAM_FRAME_ADDRESS);

/** Mermaid's theme variables, each read from a board token of the current theme. */
const THEME_VARIABLE_TOKENS: Readonly<Record<string, string>> = {
  background:          '--surface',
  primaryColor:        '--surface',
  primaryTextColor:    '--ink',
  primaryBorderColor:  '--line-strong',
  lineColor:           '--ink-muted',
  secondaryColor:      '--wash',
  tertiaryColor:       '--surface',
  textColor:           '--ink',
  mainBkg:             '--surface',
  nodeBorder:          '--line-strong',
  clusterBkg:          '--wash',
  edgeLabelBackground: '--surface',
  fontFamily:          '--font-ui',
};

const THEME_ATTRIBUTE = 'data-theme';

const DARK_THEME = 'dark';

/** How long a node's offer stays once the pointer left the node, so the pointer can reach it. */
export const NODE_OFFER_GRACE_MILLISECONDS = 600;

export interface HoveredNode {
  readonly node: DiagramNode;
  readonly top:  number;
  readonly left: number;
}

export interface DiagramFrameProps {
  readonly title:          string;
  readonly source:         string;
  /** Offers a comment on the hovered node; absent, the diagram offers none. */
  readonly onNodeComment?: (node: DiagramNode) => void;
  /** "+ Comment on node · line 20": the words of the hovered node's offer. */
  readonly offerLabelOf?:  (node: DiagramNode) => string;
}

/** The tokens as mermaid's theme variables, and `darkMode`, which has the frame draw on a dark ground and derive its colours for it. */
function themeVariablesOf(theme: string | null): Record<string, string> {
  const style = getComputedStyle(document.documentElement);
  const tokenVariables = Object.entries(THEME_VARIABLE_TOKENS).flatMap(([variable, token]) => {
    const value = style.getPropertyValue(token).trim();
    return value === '' ? [] : [[variable, value]];
  });
  return { ...Object.fromEntries(tokenVariables), darkMode: String(theme === DARK_THEME) };
}

function isFrameAnswer(data: unknown): data is DiagramFrameAnswer {
  if (typeof data !== 'object' || data === null) return false;
  const { protocol, protocolVersion, kind } = data as Readonly<Record<string, unknown>>;
  return protocol === DIAGRAM_FRAME_PROTOCOL && protocolVersion === PAGE_CONTRACT_VERSIONS.gaiaDiagramFrame && typeof kind === 'string';
}

function renderRequestOf(source: string, theme: string | null): DiagramFrameRequest {
  return {
    protocol: DIAGRAM_FRAME_PROTOCOL, protocolVersion: PAGE_CONTRACT_VERSIONS.gaiaDiagramFrame, kind: 'render', source, themeVariables: themeVariablesOf(theme),
  };
}

/** The page's theme as its root names it, followed as the theme switch changes it. */
function useThemeName(): string | null {
  const [theme, setTheme] = useState<string | null>(null);
  useEffect(() => {
    const read = (): void => setTheme(document.documentElement.getAttribute(THEME_ATTRIBUTE));
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: [THEME_ATTRIBUTE] });
    return () => observer.disconnect();
  }, []);
  return theme;
}

export function DiagramFrame({
  title, source, onNodeComment, offerLabelOf
}: DiagramFrameProps) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [heightPixels, setHeightPixels] = useState<number | null>(null);
  const [nodes, setNodes] = useState<readonly DiagramNode[]>([]);
  const [hovered, setHovered] = useState<HoveredNode | null>(null);
  const [offerIsLeaving, setOfferIsLeaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const theme = useThemeName();
  const address = useContext(DiagramFrameAddressContext);
  const clock = useBoardClock();

  useEffect(() => {
    if (!loaded) return;
    // The frame's origin is opaque, so its messages carry the origin "null"; it is told apart by its window alone.
    frame.current?.contentWindow?.postMessage(renderRequestOf(source, theme), '*');
  }, [loaded, source, theme]);

  useEffect(() => {
    if (!offerIsLeaving) return undefined;
    return clock.after(NODE_OFFER_GRACE_MILLISECONDS, () => {
      setHovered(null);
      setOfferIsLeaving(false);
    });
  }, [clock, offerIsLeaving]);

  useEffect(() => {
    const receive = (event: MessageEvent): void => {
      if (frame.current === null || event.source !== frame.current.contentWindow || !isFrameAnswer(event.data)) return;
      const answer = event.data;
      switch (answer.kind) {
        case 'rendered':
          setFailure(null);
          setHeightPixels(answer.heightPixels);
          setNodes(answer.nodes);
          setHovered(null);
          setOfferIsLeaving(false);
          return;
        case 'node-hovered': {
          const node = nodes.find((candidate) => candidate.nodeId === answer.nodeId);
          if (node !== undefined) setHovered({ node, top: answer.top, left: answer.left });
          setOfferIsLeaving(false);
          return;
        }
        case 'node-left':
          setOfferIsLeaving(true);
          return;
        case 'render-failed':
          setFailure(answer.reason);
      }
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [nodes]);

  return (
    <div className="board-document-diagram-frame">
      {failure === null
        ? null
        : (
          <div className="board-document-diagram-failure">
            <span className="board-refusal" role="status">{`The diagram did not draw: ${failure}`}</span>
            <pre className="board-document-code"><code>{source}</code></pre>
          </div>
        )}
      <iframe
        ref={frame}
        className="board-document-diagram-canvas"
        title={title}
        sandbox="allow-scripts"
        {...(address === null ? { srcDoc: '' } : { src: address })}
        data-failed={failure === null ? undefined : ''}
        style={heightPixels === null ? undefined : { height: `${heightPixels}px` }}
        onLoad={() => setLoaded(true)}
      />
      {hovered === null || onNodeComment === undefined
        ? null
        : (
          <button
            type="button"
            className="board-document-node-comment"
            style={{ top: `${hovered.top}px`, left: `${hovered.left}px` }}
            onPointerEnter={() => setOfferIsLeaving(false)}
            onPointerLeave={() => setOfferIsLeaving(true)}
            onClick={() => {
              onNodeComment(hovered.node);
              setHovered(null);
              setOfferIsLeaving(false);
            }}
          >
            {offerLabelOf?.(hovered.node) ?? `+ Comment on ${hovered.node.label}`}
          </button>
        )}
    </div>
  );
}
