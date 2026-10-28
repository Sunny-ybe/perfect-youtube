// Runs in YouTube's own page context so it can use YouTube's in-page (no reload) navigation.
window.addEventListener('message', (e) => {
  if (e.source !== window || e.data?.source !== 'ytlp' || e.data.type !== 'navigate') return;
  const id = e.data.id;
  const app = document.querySelector('ytd-app');
  if (!app) return;
  const endpoint = {
    commandMetadata: { webCommandMetadata: { url: '/watch?v=' + id, webPageType: 'WEB_PAGE_TYPE_WATCH', rootVe: 3832 } },
    watchEndpoint: { videoId: id }
  };
  app.dispatchEvent(new CustomEvent('yt-navigate', { bubbles: true, composed: true, detail: { endpoint } }));
});
