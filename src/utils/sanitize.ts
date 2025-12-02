// src/utils/sanitize.ts
import DOMPurify from 'dompurify';

/**
 * Sanitiza HTML para prevenir XSS
 */
export function sanitizeHtml(html: string): string {
  if (typeof window !== 'undefined') {
    return DOMPurify.sanitize(html);
  }
  return html;
}
