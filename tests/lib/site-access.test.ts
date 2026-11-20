import { describe, expect, it } from 'vitest';
import { siteHost, sitePattern } from '@/lib/site-access';

describe('sitePattern', () => {
  it('is the match pattern of a web page site', () => {
    expect(sitePattern('https://gl.wikipedia.org/wiki/Galicia?x=1#y')).toBe('https://gl.wikipedia.org/*');
    expect(sitePattern('http://localhost:8080/a')).toBe('http://localhost:8080/*');
  });

  it('is null for other addresses', () => {
    expect(sitePattern(undefined)).toBeNull();
    expect(sitePattern('')).toBeNull();
    expect(sitePattern('file:///Users/x/a.pdf')).toBeNull();
    expect(sitePattern('about:addons')).toBeNull();
    expect(sitePattern('not a url')).toBeNull();
  });
});

describe('siteHost', () => {
  it('names the host, with its port', () => {
    expect(siteHost('https://gl.wikipedia.org/wiki/Galicia')).toBe('gl.wikipedia.org');
    expect(siteHost('http://localhost:8080/a')).toBe('localhost:8080');
  });
});
