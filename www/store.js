const config = window.__APP_CONFIG__ || {
  apiBaseUrl: 'http://localhost:3001',
  cdnBaseUrl: 'http://localhost:3002'
};

let products = [];
const STORAGE_KEY = 'mini_cart_v2';

const state = {
  cart: new Map(),
  query: '',
  sort: 'featured',
  category: ''
};

const els = {
  list: document.getElementById('product-list'),
  headerCount: document.getElementById('header-cart-count'),
  status: document.getElementById('status'),
  searchInput: document.getElementById('search-input'),
  categorySelect: document.getElementById('category-select'),
  sortSelect: document.getElementById('sort-select')
};

function formatTRY(value) {
  return `${value.toFixed(2)} TRY`;
}

function imageSrc(path) {
  if (!path) return `${config.cdnBaseUrl}/assets/images/products/tshirt.svg`;
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:')) return path;
  return `${config.cdnBaseUrl}${path}`;
}

function setStatus(message, isError = false) {
  els.status.textContent = message;
  els.status.style.color = isError ? '#b00020' : '#0a7a2f';
}

function persistCart() {
  const oldRaw = localStorage.getItem(STORAGE_KEY);
  const oldData = oldRaw ? JSON.parse(oldRaw) : {};
  const payload = { ...oldData, items: [...state.cart.entries()] };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function loadCart() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    (parsed.items || []).forEach(([productId, quantity]) => {
      if (products.some((p) => p.id === productId) && Number(quantity) > 0) {
        state.cart.set(productId, Number(quantity));
      }
    });
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function renderHeaderCount() {
  const count = [...state.cart.values()].reduce((sum, n) => sum + Number(n || 0), 0);
  els.headerCount.textContent = String(count);
}

function getVisibleProducts() {
  let result = [...products];

  if (state.query.trim()) {
    const q = state.query.toLowerCase();
    result = result.filter((p) => p.name.toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q));
  }

  if (state.category) {
    result = result.filter((p) => (p.categorySlug || '').toLowerCase() === state.category);
  }

  if (state.sort === 'price_asc') result.sort((a, b) => a.price - b.price);
  if (state.sort === 'price_desc') result.sort((a, b) => b.price - a.price);
  if (state.sort === 'name_asc') result.sort((a, b) => a.name.localeCompare(b.name, 'tr'));

  return result;
}

function addToCart(productId) {
  const qty = state.cart.get(productId) || 0;
  state.cart.set(productId, qty + 1);
  persistCart();
  renderHeaderCount();

  const product = products.find((p) => p.id === productId);
  setStatus(`${product.name} sepete eklendi.`);
}

function renderProducts() {
  const visible = getVisibleProducts();
  els.list.innerHTML = '';

  if (!visible.length) {
    els.list.innerHTML = '<div class="card">Aradığın kritere uygun ürün bulunamadı.</div>';
    return;
  }

  visible.forEach((product) => {
    const card = document.createElement('article');
    card.className = 'product card';
    card.innerHTML = `
      <a href="/product.html?slug=${encodeURIComponent(product.slug || '')}" style="text-decoration:none;color:inherit;">
        <img src="${imageSrc(product.image)}" alt="${product.name}" loading="lazy" />
        <h3>${product.name}</h3>
      </a>
      <p>${product.description || ''}</p>
      <div class="product-meta">
        <span class="pill">${product.category || 'genel'}</span>
        <strong>${formatTRY(Number(product.price || 0))}</strong>
      </div>
      <small>Stok: ${Number(product.stock || 0)}</small>
      <button data-add="${product.id}" ${Number(product.stock || 0) <= 0 ? 'disabled' : ''}>Sepete Ekle</button>
    `;
    card.querySelector('button').addEventListener('click', () => addToCart(product.id));
    els.list.appendChild(card);
  });
}

function wireEvents() {
  els.searchInput.addEventListener('input', (e) => {
    state.query = e.target.value;
    renderProducts();
  });

  els.categorySelect.addEventListener('change', (e) => {
    state.category = e.target.value;
    renderProducts();
  });

  els.sortSelect.addEventListener('change', (e) => {
    state.sort = e.target.value;
    renderProducts();
  });
}

async function loadProductsFromApi() {
  try {
    const res = await fetch(`${config.apiBaseUrl}/api/products`);
    const data = await res.json();
    products = data.products || [];
  } catch {
    products = [];
  }
}

async function loadCategoriesFromApi() {
  try {
    const res = await fetch(`${config.apiBaseUrl}/api/categories`);
    const data = await res.json();
    const categories = data.categories || [];
    els.categorySelect.innerHTML = '<option value="">Kategori: Tümü</option>';
    categories.forEach((c) => {
      const opt = document.createElement('option');
      opt.value = c.slug;
      opt.textContent = `Kategori: ${c.name}`;
      els.categorySelect.appendChild(opt);
    });
  } catch {
    els.categorySelect.innerHTML = '<option value="">Kategori: Tümü</option>';
  }
}

async function bootstrap() {
  await Promise.all([loadProductsFromApi(), loadCategoriesFromApi()]);
  loadCart();
  wireEvents();
  renderProducts();
  renderHeaderCount();
}

bootstrap();
