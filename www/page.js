const config = window.__APP_CONFIG__ || { apiBaseUrl: 'http://localhost:3001' };
const titleEl = document.getElementById('page-title');
const contentEl = document.getElementById('page-content');

async function loadPage() {
  const slug = new URLSearchParams(window.location.search).get('slug');
  if (!slug) {
    contentEl.textContent = 'Sayfa bulunamadı.';
    return;
  }

  try {
    const res = await fetch(`${config.apiBaseUrl}/api/pages/${encodeURIComponent(slug)}`);
    const data = await res.json();
    if (!res.ok || !data.page) throw new Error('Sayfa bulunamadı');

    const page = data.page;
    document.title = `${page.title} | Mini Commerce`;
    titleEl.textContent = page.title;
    contentEl.textContent = page.content || '';
  } catch {
    contentEl.textContent = 'Sayfa içeriği alınamadı.';
  }
}

loadPage();
