import { extractArticle } from '@/lib/extract-article';
import { extractThread } from '@/lib/threads';
import { extractYouTube, isYouTubeVideo } from '@/lib/youtube';

// Injected into the clicked tab by the background; its return value (or what its promise resolves
// to) is the result. A PDF shown in Chrome's viewer has no readable page, so it only says so; the
// background reads the file itself. A YouTube video is read from its transcript, and a discussion
// (Hacker News, Reddit, Lobsters, Discourse) as a post and its comments.
export default defineUnlistedScript(() => {
  if (document.contentType === 'application/pdf') return { pdf: true as const, url: location.href, title: document.title };
  if (isYouTubeVideo(location.href)) return extractYouTube(document, location.href);
  return extractThread(document, location.href) ?? extractArticle(document, location.href);
});
