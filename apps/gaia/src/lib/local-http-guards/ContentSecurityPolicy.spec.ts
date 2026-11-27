/**
 * The page's content security policy: everything from its own origin, fonts in a directive of their own, frames only from its own origin and never
 * framed itself, kept by every answer without a policy of its own. The diagram frame's policy sandboxes its scripts with no origin, loading only
 * its own script, inline styles and data images.
 */
import { describe, expect, test } from 'bun:test';

import { diagramFrameContentSecurityPolicyFor, pageContentSecurityPolicyFor, withContentSecurityPolicy } from './ContentSecurityPolicy.ts';

const HTTP_FORBIDDEN = 403;

function directivesOf(policy: string): Map<string, string> {
  return new Map(policy.split('; ').map((directive) => {
    const separatorIndex = directive.indexOf(' ');
    return [directive.slice(0, separatorIndex), directive.slice(separatorIndex + 1)];
  }));
}

describe('the page policy', () => {
  test('lets the page frame its own origin alone, no forge\'s server', () => {
    expect(directivesOf(pageContentSecurityPolicyFor()).get('frame-src')).toBe('\'self\'');
  });

  test('lets no other page frame this one', () => {
    expect(directivesOf(pageContentSecurityPolicyFor()).get('frame-ancestors')).toBe('\'none\'');
  });

  test('takes scripts, styles, connections and fonts from the page\'s own origin only, and no plugin', () => {
    const directives = directivesOf(pageContentSecurityPolicyFor());
    expect([
      directives.get('default-src'),
      directives.get('script-src'),
      directives.get('style-src'),
      directives.get('connect-src'),
      directives.get('font-src'),
      directives.get('object-src'),
      directives.get('base-uri'),
      directives.get('form-action'),
    ]).toEqual(['\'self\'', '\'self\'', '\'self\'', '\'self\'', '\'self\'', '\'none\'', '\'none\'', '\'none\'']);
  });
});

describe('the diagram frame\'s policy', () => {
  test('sandboxes the frame with scripts and without its server\'s origin', () => {
    expect(directivesOf(diagramFrameContentSecurityPolicyFor()).get('sandbox')).toBe('allow-scripts');
    expect(diagramFrameContentSecurityPolicyFor()).not.toContain('allow-same-origin');
  });

  test('takes its script from its server alone, styles also inline, images only as data, and nothing else', () => {
    const directives = directivesOf(diagramFrameContentSecurityPolicyFor());
    expect(Object.fromEntries(directives)).toEqual({
      'default-src': '\'none\'',
      'script-src':  '\'self\'',
      'style-src':   '\'self\' \'unsafe-inline\'',
      'img-src':     'data:',
      'sandbox':     'allow-scripts',
    });
  });

  test('is kept on an answer that carries it, over the page\'s', () => {
    const framed = new Response('text', { headers: { 'content-security-policy': diagramFrameContentSecurityPolicyFor() } });
    const answer = withContentSecurityPolicy(framed, pageContentSecurityPolicyFor());
    expect(answer.headers.get('content-security-policy')).toBe(diagramFrameContentSecurityPolicyFor());
  });
});

describe('an answer with the policy', () => {
  test('carries the page policy, a guard\'s refusal included', () => {
    const policy  = pageContentSecurityPolicyFor();
    const refusal = withContentSecurityPolicy(Response.json({ refusal: 'forbidden' }, { status: HTTP_FORBIDDEN }), policy);
    expect(refusal.headers.get('content-security-policy')).toBe(policy);
  });

  test('keeps a policy of its own', () => {
    const policy = pageContentSecurityPolicyFor();
    const answer = withContentSecurityPolicy(new Response('text', { headers: { 'content-security-policy': 'sandbox' } }), policy);
    expect(answer.headers.get('content-security-policy')).toBe('sandbox');
  });
});
