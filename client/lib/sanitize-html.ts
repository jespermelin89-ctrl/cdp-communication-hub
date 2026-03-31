/**
 * Replace cid: image references with backend proxy URLs.
 * Call this BEFORE sanitizeHtml so the img src is valid after sanitization.
 */
export function replaceCidImages(
  html: string,
  threadId: string,
  messageId: string,
): string {
  return html.replace(
    /src=["']cid:([^"']+)["']/gi,
    (_, cid) =>
      `src="/api/v1/threads/${encodeURIComponent(threadId)}/messages/${encodeURIComponent(messageId)}/inline/${encodeURIComponent(cid)}"`,
  );
}

/**
 * Minimal HTML sanitizer for email display.
 * Strips scripts, event handlers, and dangerous elements.
 * Safe for dangerouslySetInnerHTML in email thread view.
 */
export function sanitizeHtml(html: string): string {
  // Remove script tags and their content
  let clean = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  // Remove style tags and their content
  clean = clean.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
  // Remove inline event handlers (onclick, onload, onerror, etc.)
  clean = clean.replace(/\s+on\w+\s*=\s*"[^"]*"/gi, '');
  clean = clean.replace(/\s+on\w+\s*=\s*'[^']*'/gi, '');
  clean = clean.replace(/\s+on\w+\s*=\s*\S+/gi, '');
  // Remove javascript: URLs
  clean = clean.replace(/href\s*=\s*"javascript:[^"]*"/gi, 'href="#"');
  clean = clean.replace(/href\s*=\s*'javascript:[^']*'/gi, "href='#'");
  // Remove data: URLs in src (except images which are ok)
  clean = clean.replace(/src\s*=\s*"data:(?!image\/)[^"]*"/gi, 'src=""');
  clean = clean.replace(/src\s*=\s*'data:(?!image\/)[^']*'/gi, "src=''");
  // Remove dangerous elements
  clean = clean.replace(/<\/?(?:iframe|object|embed|form|input|button|select|textarea)\b[^>]*>/gi, '');
  // Open all links in new tab for safety
  clean = clean.replace(/<a\s/gi, '<a target="_blank" rel="noopener noreferrer" ');
  // Add lazy loading to images
  clean = clean.replace(/<img /gi, '<img loading="lazy" ');
  return clean;
}

/**
 * Wrap <blockquote> elements in a collapsible <details> element.
 * Call AFTER sanitizeHtml.
 */
export function wrapQuotedContent(html: string): string {
  return html.replace(
    /(<blockquote[^>]*>)([\s\S]*?)(<\/blockquote>)/gi,
    '$1<details class="quoted-text"><summary class="text-xs text-gray-400 cursor-pointer hover:text-gray-600 dark:hover:text-gray-400 py-1 select-none">··· Visa citat</summary><div class="border-l-2 border-gray-200 dark:border-gray-700 pl-3 mt-1 opacity-70">$2</div></details>$3'
  );
}
