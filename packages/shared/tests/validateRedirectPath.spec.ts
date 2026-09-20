import { describe, expect, it } from 'vitest';
import { validateRedirectPath } from '../src/validateRedirectPath';

describe('validateRedirectPath', () => {
  it('returns / when given undefined', () => {
    expect(validateRedirectPath(undefined)).toBe('/');
  });

  it('returns / when given an empty string', () => {
    expect(validateRedirectPath('')).toBe('/');
  });

  it('accepts a same-origin relative path', () => {
    expect(validateRedirectPath('/projects/123')).toBe('/projects/123');
  });

  it('rejects an absolute URL', () => {
    expect(validateRedirectPath('https://evil.com')).toBe('/');
  });

  it('rejects a protocol-relative URL', () => {
    expect(validateRedirectPath('//evil.com')).toBe('/');
  });

  it('rejects a backslash-prefixed path (browsers treat it as protocol-relative)', () => {
    expect(validateRedirectPath('/\\evil.com')).toBe('/');
  });

  it('rejects a path with no leading slash', () => {
    expect(validateRedirectPath('projects/123')).toBe('/');
  });
});
