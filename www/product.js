const config = window.__APP_CONFIG__ || { apiBaseUrl: 'http://localhost:3001', cdnBaseUrl: 'http://localhost:3002' };
const target = document.getElementById('product-detail');

function formatTRY(value) { return `${Number(value).toFixed(2)} TRY`; }
function imageSrc(path) {
  if (!path) return `${config.cdnBaseUrl}/assets/images/products/tshirt.svg`;
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:')) return path;
  return `${config.cdnBaseUrl}${path}`;
}

async function load() {
  const slug = new URLSearchParams(window.location.search).get('slug');
  if (!slug) {
    target.textContent = 'Ürün bulunamadı.';
    return;
  }

  try {
    const res = await fetch(`${config.apiBaseUrl}/api/products/${encodeURIComponent(slug)}`);
    const data = await res.json();
    if (!res.ok || !data.product) throw new Error('Ürün bulunamadı');
    const p = data.product;

    target.innerHTML = `
      <div class="layout" style="grid-template-columns: 1fr 1fr;">
        <div class="card">
          <img src="${imageSrc(p.image)}" alt="${p.name}" style="width:100%;border-radius:10px;" />
        </div>
        <div class="card">
          <h2>${p.name}</h2>
          <p><span class="pill">${p.category}</span></p>
          <p>${p.description || ''}</p>
          <h3>${formatTRY(p.price)}</h3>
          <p><small>SEO URL slug: <code>${p.slug}</code></small></p>
          <a href="/" class="ghost" style="padding:10px 12px;border-radius:10px;text-decoration:none;display:inline-block;">Alışverişe dön</a>
        </div>
      </div>
    `;
  } catch {
    target.textContent = 'Ürün detay verisi alınamadı.';
  }
}

load();
