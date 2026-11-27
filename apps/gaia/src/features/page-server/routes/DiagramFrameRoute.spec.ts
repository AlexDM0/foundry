/**
 * The diagram frame built from the real `page/diagram-frame/`: served with its scripts under its own sandboxed policy, its script loaded as a
 * classic one, since a module would ask with `Origin: null`, which the Origin guard refuses; the bundle holds every module and no colour, which
 * comes from the board's tokens.
 */
import { readFileSync } from 'node:fs';
import { join }         from 'node:path';

import { describe, expect, test } from 'bun:test';

import { diagramFrameContentSecurityPolicyFor }                                   from '../../../lib/local-http-guards/ContentSecurityPolicy.ts';
import { diagramFrameAnswerFor, isDiagramFramePath }                              from './DiagramFrameRoute.ts';
import { builtDiagramFrameFilesOf, diagramFrameFolderPath, type PageFilesSource } from './PageFilesRoute.ts';

const SCRIPT_REFERENCE = /<script\b[^>]*\bsrc="([^"]+)"[^>]*>/g;

const MODULE_SCRIPT = /type="module"/;

const CROSS_ORIGIN_ATTRIBUTE = /\bcrossorigin\b/i;

const LATER_MODULE_LOAD = /\bimport\s*\(/;

/** A hexadecimal colour, or a colour function, written into the source rather than handed in as a theme variable. */
const COLOUR_LITERAL = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/i;

let sharedFrameFiles: PageFilesSource | null = null;

function frameFiles(): PageFilesSource {
  sharedFrameFiles ??= builtDiagramFrameFilesOf(diagramFrameFolderPath());
  return sharedFrameFiles;
}

async function frameText(): Promise<string> {
  return (await diagramFrameAnswerFor(frameFiles(), '/diagram-frame/')).text();
}

describe('the real diagram frame', () => {
  test('is served at /diagram-frame/ under the frame\'s own policy, as HTML', async () => {
    const frame = await diagramFrameAnswerFor(frameFiles(), '/diagram-frame/');
    expect([frame.status, frame.headers.get('content-type'), frame.headers.get('content-security-policy')]).toEqual([
      200,
      'text/html;charset=utf-8',
      diagramFrameContentSecurityPolicyFor(),
    ]);
    expect(await frame.text()).toContain('id="diagram"');
  });

  test('loads its script as a classic one, with no module type and no crossorigin', async () => {
    const text = await frameText();
    expect(text).not.toMatch(MODULE_SCRIPT);
    expect(text).not.toMatch(CROSS_ORIGIN_ATTRIBUTE);
  });

  test('serves every script it names beside it, under the frame\'s policy, as one bundle that loads no module later', async () => {
    const scriptPaths = [...(await frameText()).matchAll(SCRIPT_REFERENCE)].map((reference) => `/diagram-frame/${reference[1] ?? ''}`);
    expect(scriptPaths).toEqual(['/diagram-frame/DiagramFrameScript.js']);
    for (const scriptPath of scriptPaths) {
      const script = await diagramFrameAnswerFor(frameFiles(), scriptPath);
      expect([script.status, (script.headers.get('content-type') ?? '').split(';')[0], script.headers.get('content-security-policy')]).toEqual([
        200,
        'text/javascript',
        diagramFrameContentSecurityPolicyFor(),
      ]);
      expect(await script.text()).not.toMatch(LATER_MODULE_LOAD);
    }
  });

  test('answers a file the build did not make as not found, under no policy of its own', async () => {
    const absent = await diagramFrameAnswerFor(frameFiles(), '/diagram-frame/absent.js');
    expect([absent.status, absent.headers.get('content-security-policy')]).toEqual([404, null]);
  });

  test('holds no colour in its script\'s source', () => {
    expect(readFileSync(join(diagramFrameFolderPath(), 'DiagramFrameScript.ts'), 'utf8')).not.toMatch(COLOUR_LITERAL);
  });
});

describe('isDiagramFramePath', () => {
  test('takes the frame\'s folder and what is in it, and no other page path', () => {
    expect(['/diagram-frame/', '/diagram-frame/DiagramFrameScript.js', '/', '/diagram-frame', '/chunk-example.js'].map(isDiagramFramePath)).toEqual([
      true,
      true,
      false,
      false,
      false,
    ]);
  });
});
