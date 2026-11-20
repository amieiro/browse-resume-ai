import type { Article } from './prompt';
import type { SummaryErrorCode } from '@/providers/types';

/** Sent by the background to the offscreen PDF reader. */
export type ReadPdfRequest = { target: 'pdf-reader'; type: 'read-pdf'; url: string; title: string };

export type ReadPdfResult =
  | { ok: true; article: Article | null }
  | { ok: false; code: SummaryErrorCode; message: string };

/** Largest PDF downloaded for a summary. */
export const MAX_PDF_BYTES = 100 * 1024 * 1024;
