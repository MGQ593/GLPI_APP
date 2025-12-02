// src/utils/htmlDecode.ts

/**
 * Decodifica HTML entities y reescribe URLs de documentos GLPI para usar el proxy
 */
export function decodeHtmlEntities(html: string, glpiSessionToken: string | null): string {
  if (!html) return '';

  let processed = html
    .replace(/&#60;/g, '<')
    .replace(/&#62;/g, '>')
    .replace(/&#38;/g, '&')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');

  // Reescribir URLs de documentos GLPI para usar nuestro proxy
  // Patrones posibles:
  // - /front/document.send.php?docid=XXX
  // - /front/document.send.php?docid=XXX&itemtype=Ticket&items_id=YYY
  // - https://glpi.../front/document.send.php?docid=XXX...
  const docPattern = /src=["'](?:https?:\/\/[^"']*)?\/front\/document\.send\.php\?docid=(\d+)[^"']*["']/gi;
  processed = processed.replace(docPattern, (_match, docId) => {
    return `src="/api/glpi/document/${docId}?session_token=${glpiSessionToken}"`;
  });

  // También manejar URLs relativas sin /front/ inicial
  const docPattern2 = /src=["']document\.send\.php\?docid=(\d+)[^"']*["']/gi;
  processed = processed.replace(docPattern2, (_match, docId) => {
    return `src="/api/glpi/document/${docId}?session_token=${glpiSessionToken}"`;
  });

  return processed;
}
