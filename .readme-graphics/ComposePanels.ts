// Writes the root README's store panels as HTML pages, with list.txt for shoot.sh: headline, subhead and a framed window per panel.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join }                    from 'node:path';

const [repositoryRoot = '', outputFolder = ''] = process.argv.slice(2);
const gaiaShotsFolder = join(repositoryRoot, '.readme-graphics', 'build', 'gaia-shots');
const flintFramesFolder = join(repositoryRoot, '.claude', '.evidence', 'flint-frames', 'root-readme');

const PANEL_WIDTH = 1280;
const PANEL_HEIGHT = 800;
const WINDOW_WIDTH = 1120;
const WINDOW_TOP = 236;
const WINDOW_BAR_HEIGHT = 34;
const FONT = "-apple-system,BlinkMacSystemFont,'SF Pro Display','Inter','Segoe UI',Helvetica,Arial,sans-serif";

type PanelTheme = 'light' | 'dark';

const PALETTES = {
  light: {
    background: 'radial-gradient(120% 80% at 50% 0%,#FFFFFF 0%,#F4F4F4 45%,#E7E7E7 100%)', headline: '#181818', subhead: '#5A5A5A',
    eyebrow: '#C43300', windowBar: '#ECECEC', windowTitle: '#6E6E73', windowBorder: 'rgba(0,0,0,.12)', content: '#F6F6F6',
  },
  dark: {
    background: 'radial-gradient(120% 80% at 50% 0%,#2E2E30 0%,#1B1B1C 50%,#0F0F10 100%)', headline: '#F5F5F7', subhead: '#A1A1A6',
    eyebrow: '#FF814C', windowBar: '#2A2A2D', windowTitle: '#98989D', windowBorder: 'rgba(255,255,255,.10)', content: '#151515',
  },
} as const;

interface WindowLayer {
  readonly imagePath:  string;
  readonly title:      string;
  readonly left:       number;
  readonly top:        number;
  readonly width:      number;
  readonly height:     number;
  readonly theme:      PanelTheme;
}

interface WindowPanel {
  readonly name:     string;
  readonly theme:    PanelTheme;
  readonly eyebrow:  string;
  readonly headline: string;
  readonly subhead:  string;
  readonly windows:  readonly WindowLayer[];
}

function centredWindow(imagePath: string, title: string, theme: PanelTheme): WindowLayer {
  return {
    imagePath, title, theme,
    left:   (PANEL_WIDTH - WINDOW_WIDTH) / 2,
    top:    WINDOW_TOP,
    width:  WINDOW_WIDTH,
    height: PANEL_HEIGHT - WINDOW_TOP + 40,
  };
}

const GAIA_TITLE = 'Gaia';
const STOREFRONT_IN_GAIA_TITLE = 'Gaia · Example Storefront';

const WINDOW_PANELS: readonly WindowPanel[] = [
  {
    name: 'suite-hero', theme: 'light', eyebrow: 'forge  +  gaia',
    headline: 'Your agents’ factory floor.',
    subhead:  'forge runs Claude Code agents through a ticket board and lands their work on main. Gaia watches every forge on the Mac from one window.',
    windows:  [
      { imagePath: join(gaiaShotsFolder, 'A1-light.png'), title: GAIA_TITLE, theme: 'light', left: 40, top: 236, width: 760, height: 600 },
      { imagePath: join(gaiaShotsFolder, 'board-kanban-light.png'), title: STOREFRONT_IN_GAIA_TITLE, theme: 'light', left: 440, top: 318, width: 800, height: 520 },
    ],
  },
  {
    name: 'forge-kanban', theme: 'light', eyebrow: 'forge',
    headline: 'Agents build. Code decides.',
    subhead:  'Every ticket from draft to Done. The program, not an agent, checks each report and moves each ticket.',
    windows:  [centredWindow(join(gaiaShotsFolder, 'board-kanban-light.png'), STOREFRONT_IN_GAIA_TITLE, 'light')],
  },
  {
    name: 'forge-questions', theme: 'light', eyebrow: 'forge',
    headline: 'Only what code can’t answer.',
    subhead:  'A builder’s question reaches you with what each option touches and trades off, beside the ticket it holds up.',
    windows:  [centredWindow(join(gaiaShotsFolder, 'board-questions-light.png'), STOREFRONT_IN_GAIA_TITLE, 'light')],
  },
  {
    name: 'forge-progress', theme: 'light', eyebrow: 'forge',
    headline: 'Done means merged.',
    subhead:  'Gantt rows by epic. A ticket is finished when the Airlock has landed it on main, not when an agent says so.',
    windows:  [centredWindow(join(gaiaShotsFolder, 'board-progress-light.png'), STOREFRONT_IN_GAIA_TITLE, 'light')],
  },
  {
    name: 'forge-dark', theme: 'dark', eyebrow: 'forge',
    headline: 'Light or dark.',
    subhead:  'The same board in either theme, or following the system.',
    windows:  [centredWindow(join(gaiaShotsFolder, 'board-kanban-dark.png'), STOREFRONT_IN_GAIA_TITLE, 'dark')],
  },
  {
    name: 'gaia-attention', theme: 'light', eyebrow: 'gaia',
    headline: 'Every forge. One window.',
    subhead:  'What waits on you across every board, oldest first and escalations on top, beside the forges that need a look.',
    windows:  [centredWindow(join(gaiaShotsFolder, 'A1-light.png'), GAIA_TITLE, 'light')],
  },
  {
    name: 'gaia-agents', theme: 'dark', eyebrow: 'gaia',
    headline: 'Every agent on this Mac.',
    subhead:  'Per forge and per job, against the machine’s limit. Select one to read what its forge reports.',
    windows:  [centredWindow(join(gaiaShotsFolder, 'A2-dark.png'), GAIA_TITLE, 'dark')],
  },
  {
    name: 'gaia-activity', theme: 'light', eyebrow: 'gaia',
    headline: 'What just happened, everywhere.',
    subhead:  'The newest entries of each forge, as each forge words them, with what landed and what it cost today.',
    windows:  [centredWindow(join(gaiaShotsFolder, 'A3-light.png'), GAIA_TITLE, 'light')],
  },
  {
    name: 'gaia-forges', theme: 'light', eyebrow: 'gaia',
    headline: 'Start, stop, update.',
    subhead:  'Every forge on this machine with its Hephaestus, its agents and its code, under the one limit the machine sets.',
    windows:  [centredWindow(join(gaiaShotsFolder, 'A4-light.png'), GAIA_TITLE, 'light')],
  },
];

const FLINT_TILES = [
  { intent: 'ink-draft', caption: 'drafts a ticket' },
  { intent: 'gate-run', caption: 'runs the gates' },
  { intent: 'customs', caption: 'clears Customs' },
  { intent: 'ask', caption: 'asks you' },
  { intent: 'airlock', caption: 'enters the Airlock' },
  { intent: 'ship', caption: 'lands on main' },
] as const;

function windowStyles(): string {
  return `.window{position:absolute;border-radius:12px;overflow:hidden}
.bar{height:${WINDOW_BAR_HEIGHT}px;position:relative;text-align:center}
.dots{position:absolute;left:14px;top:11px;display:flex;gap:8px}.dots i{width:12px;height:12px;border-radius:50%;display:block}
.title{position:absolute;left:0;right:0;top:9px;font-size:13px}
.content{position:relative;overflow:hidden}.content img{display:block;width:100%}`;
}

function windowMarkup(layer: WindowLayer, zIndex: number): string {
  const palette = PALETTES[layer.theme];
  const shadow = layer.theme === 'light'
    ? '0 24px 60px rgba(0,0,0,.20),0 6px 18px rgba(0,0,0,.08)'
    : '0 24px 60px rgba(0,0,0,.55),0 6px 18px rgba(0,0,0,.30)';
  return `<div class="window" style="left:${layer.left}px;top:${layer.top}px;width:${layer.width}px;height:${layer.height}px;z-index:${zIndex};box-shadow:0 0 0 1px ${palette.windowBorder},${shadow}">
<div class="bar" style="background:${palette.windowBar}"><div class="dots"><i style="background:#FF5F57"></i><i style="background:#FEBC2E"></i><i style="background:#28C840"></i></div>
<div class="title" style="color:${palette.windowTitle}">${layer.title}</div></div>
<div class="content" style="height:${layer.height - WINDOW_BAR_HEIGHT}px;background:${palette.content}"><img src="file://${layer.imagePath}"></div></div>`;
}

function panelShell(theme: PanelTheme, eyebrow: string, headline: string, subhead: string, extraStyles: string, body: string): string {
  const palette = PALETTES[theme];
  return `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;background:transparent}
.panel{position:relative;width:${PANEL_WIDTH}px;height:${PANEL_HEIGHT}px;border-radius:28px;overflow:hidden;background:${palette.background};font-family:${FONT};text-align:center;-webkit-font-smoothing:antialiased}
.eyebrow{position:absolute;left:0;right:0;top:54px;font-size:15px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:${palette.eyebrow};white-space:pre}
.headline{position:absolute;left:0;right:0;top:80px;font-size:52px;font-weight:700;letter-spacing:-0.025em;color:${palette.headline}}
.subhead{position:absolute;left:150px;right:150px;top:154px;font-size:21px;line-height:1.38;color:${palette.subhead}}
${extraStyles}
</style></head><body><div class="panel">
<div class="eyebrow">${eyebrow}</div><div class="headline">${headline}</div><div class="subhead">${subhead}</div>
${body}
</div></body></html>`;
}

function windowPanelPage(panel: WindowPanel): string {
  const windows = panel.windows.map((layer, index) => windowMarkup(layer, index + 1)).join('\n');
  return panelShell(panel.theme, panel.eyebrow, panel.headline, panel.subhead, windowStyles(), windows);
}

function flintPanelPage(): string {
  const tileStyles = `.tiles{position:absolute;left:70px;right:70px;top:262px;display:grid;grid-template-columns:repeat(3,1fr);gap:22px}
.tile{background:#F6F6F6;border-radius:18px;box-shadow:0 0 0 1px rgba(0,0,0,.08),0 10px 30px rgba(0,0,0,.08);overflow:hidden}
.tile img{display:block;width:100%;height:auto;margin-top:-28px;margin-bottom:-18px}
.caption{font-size:18px;font-weight:600;color:#181818;padding:0 0 18px}`;
  const tiles = FLINT_TILES.map((tile) => `<div class="tile"><img src="file://${join(flintFramesFolder, `${tile.intent}-right-still.png`)}"><div class="caption">${tile.caption}</div></div>`).join('\n');
  return panelShell('light', 'flint', 'Meet Flint.', 'A small orange diamond that acts out what the agents do, drawn over the page by its own renderer and never in the way of a click.', tileStyles, `<div class="tiles">${tiles}</div>`);
}

mkdirSync(outputFolder, { recursive: true });
const listLines: string[] = [];
function writePanel(name: string, page: string): void {
  const pagePath = join(outputFolder, `${name}.html`);
  writeFileSync(pagePath, page);
  listLines.push(`${name} ${PANEL_WIDTH} ${PANEL_HEIGHT} file://${pagePath}`);
}
for (const panel of WINDOW_PANELS) writePanel(panel.name, windowPanelPage(panel));
writePanel('flint', flintPanelPage());
writeFileSync(join(outputFolder, 'list.txt'), `${listLines.join('\n')}\n`);
console.log(`${listLines.length} panels written to ${outputFolder}`);
