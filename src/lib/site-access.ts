// Optional access to a site, asked from the summary view's own button. A click on the toolbar icon
// (activeTab) lets the extension read the page; Firefox drops that on any navigation, Chrome when
// the tab goes to another site. With the site allowed, "Summarize again" works on its other pages.

/** The match pattern for a web page's site ("https://gl.wikipedia.org/*"), or null for other URLs. */
export function sitePattern(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const { protocol, host } = new URL(url);
    return protocol === 'https:' || protocol === 'http:' ? `${protocol}//${host}/*` : null;
  } catch {
    return null;
  }
}

/** The host to name in the button ("gl.wikipedia.org"). */
export function siteHost(url: string): string {
  return new URL(url).host;
}
