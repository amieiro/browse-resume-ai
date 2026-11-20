import { extractArticle } from '@/lib/extract-article';

// Injected into the clicked tab by the background; its return value is the result. A PDF shown in
// Chrome's viewer has no readable page, so it only says so; the background reads the file itself.
export default defineUnlistedScript(() =>
  document.contentType === 'application/pdf'
    ? { pdf: true as const, url: location.href, title: document.title }
    : extractArticle(document, location.href),
);
