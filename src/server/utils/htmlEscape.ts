/**
 * Escapes unsafe characters in strings before interpolation into HTML templates.
 * Prevents Cross-Site Scripting (XSS).
 */
export function escapeHtml(str: string | null | undefined): string {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Escapes values safe for JSON serialization inside script tags:
 * Prevents closing </script> tags in strings from breaking script execution.
 */
export function safeJsonStringify(data: any): string {
  return JSON.stringify(data).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
}
