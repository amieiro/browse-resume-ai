import { extractArticle } from '@/lib/extract-article';

// Injected into the clicked tab by the background; its return value is the result.
export default defineUnlistedScript(() => extractArticle(document, location.href));
