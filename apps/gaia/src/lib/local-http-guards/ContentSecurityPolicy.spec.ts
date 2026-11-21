/**
 * The page's content security policy: frames from its own origin alone, which the sandboxed `srcdoc` frame needs, never framed itself, every other
 * resource from its own origin, fonts in a directive of their own rather than left to the default. An answer keeps a policy of its own
 * and gets the page's otherwise, a guard's refusal included.
 */
import { describe, expect, test } from 'bun:test';

import { pageContentSecurityPolicyFor, withContentSecurityPolicy } from './ContentSecurityPolicy.ts';

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
