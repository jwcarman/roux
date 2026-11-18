/**
 * This response's Content-Security-Policy nonce, from the `<meta property="csp-nonce">` Vite writes
 * and roux's shell fills in. Code that adds a `<style>` or `<script>` at runtime must tag it with
 * this, or the browser refuses it (Emotion's cache, which `ThemeProvider` sets up, and next-themes).
 */
export function cspNonce(): string | undefined {
  const meta = document.querySelector<HTMLMetaElement>('meta[property="csp-nonce"]');
  // Browsers hide a nonce attribute's value once parsed; the property keeps it.
  return meta?.nonce || meta?.getAttribute("nonce") || undefined;
}
