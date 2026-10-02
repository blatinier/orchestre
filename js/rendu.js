// Canvas sizing for PDF pages. Tablets refuse very large canvases (iOS Safari
// draws nothing above ~16.7M pixels) and run out of canvas memory quickly, so a
// page is never rendered above PIXELS_MAX; CSS then upscales it slightly.

export const PIXELS_MAX = 5_000_000;

// PDF.js scale for a page `largeurPdf` points wide shown `largeurCss` pixels wide
export function echelleRendu({ largeurCss, largeurPdf, ratio, dpr }) {
    const nette = (largeurCss / largeurPdf) * (dpr || 1);
    const plafond = Math.sqrt(PIXELS_MAX / (largeurPdf * largeurPdf * ratio));
    return Math.min(nette, plafond);
}
