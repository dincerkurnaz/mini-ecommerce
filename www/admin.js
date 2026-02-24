const config = window.__APP_CONFIG__ || { apiBaseUrl: 'http://localhost:3001' };
let token = localStorage.getItem('mini_admin_token') || '';

const els = {
  email: document.getElementById('admin-email'),
  password: document.getElementById('admin-password'),
  loginBtn: document.getElementById('login-btn'),
  loginStatus: document.getElementById('login-status'),
  list: document.getElementById('admin-products'),
  status: document.getElementById('admin-status'),
  form: document.getElementById('new-product-form'),
  categorySelect: document.getElementById('new-category'),
  categoryForm: document.getElementById('new-category-form'),
  orders: document.getElementById('admin-orders'),
  modules: document.getElementById('admin-modules'),
  pages: document.getElementById('admin-pages'),
  pageForm: document.getElementById('new-page-form')
};

function setStatus(message, isError = false) { els.status.textContent = message; els.status.style.color = isError ? '#b00020' : '#0a7a2f'; }
function setLoginStatus(message, isError = false) { els.loginStatus.textContent = message; els.loginStatus.style.color = isError ? '#b00020' : '#0a7a2f'; }

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${config.apiBaseUrl}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'API hatası');
  return data;
}

function row(product) {
  const wrap = document.createElement('div');
  wrap.className = 'cart-line';
  wrap.innerHTML = `
    <div>
      <strong>${product.name}</strong>
      <small>${product.category} · ${Number(product.price).toFixed(2)} TRY · slug: ${product.slug || '-'}</small>
      <div style="margin-top:6px;">${product.description || ''}</div>
    </div>
    <div class="qty-controls">
      <button data-edit="${product.id}" class="ghost">Düzenle</button>
      <button data-del="${product.id}" class="danger">Sil</button>
    </div>
  `;

  wrap.querySelector('[data-del]').addEventListener('click', async () => {
    try { await api(`/api/admin/products/${product.id}`, { method: 'DELETE' }); setStatus('Ürün silindi.'); await loadProducts(); }
    catch (e) { setStatus(e.message, true); }
  });

  wrap.querySelector('[data-edit]').addEventListener('click', async () => {
    const name = prompt('Yeni ürün adı', product.name); if (!name) return;
    const price = prompt('Yeni fiyat', String(product.price)); if (!price) return;
    try {
      await api(`/api/admin/products/${product.id}`, { method: 'PUT', body: JSON.stringify({ name, price: Number(price) }) });
      setStatus('Ürün güncellendi.');
      await loadProducts();
    } catch (e) { setStatus(e.message, true); }
  });

  return wrap;
}

async function loadCategories() {
  if (!token) return;
  try {
    const data = await api('/api/admin/categories');
    const categories = data.categories || [];
    els.categorySelect.innerHTML = '';
    categories.forEach((c) => {
      const opt = document.createElement('option');
      opt.value = c.name;
      opt.textContent = c.name;
      els.categorySelect.appendChild(opt);
    });
  } catch (e) {
    setStatus(e.message, true);
  }
}

async function loadProducts() {
  if (!token) { els.list.innerHTML = 'Önce admin girişi yapmalısın.'; return; }
  try {
    const data = await api('/api/admin/products');
    const products = data.products || [];
    els.list.innerHTML = '';
    if (!products.length) { els.list.textContent = 'Ürün bulunamadı.'; return; }
    products.forEach((p) => els.list.appendChild(row(p)));
  } catch (e) { els.list.innerHTML = ''; setStatus(e.message, true); }
}

function orderRow(order) {
  const wrap = document.createElement('div');
  wrap.className = 'cart-line';
  wrap.innerHTML = `
    <div>
      <strong>${order.id}</strong>
      <small>${Number(order.amount).toFixed(2)} ${order.currency} · ${order.customer?.email || '-'}</small>
      <div style="margin-top:6px;">Durum: <b>${order.status}</b></div>
    </div>
    <div class="qty-controls">
      <button data-os="${order.id}" data-status="pending" class="ghost">Pending</button>
      <button data-os="${order.id}" data-status="paid" class="ghost">Paid</button>
      <button data-os="${order.id}" data-status="shipped" class="ghost">Shipped</button>
      <button data-os="${order.id}" data-status="cancelled" class="danger">Cancelled</button>
    </div>
  `;

  wrap.querySelectorAll('[data-os]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await api(`/api/admin/orders/${btn.getAttribute('data-os')}/status`, {
          method: 'PUT',
          body: JSON.stringify({ status: btn.getAttribute('data-status') })
        });
        setStatus('Sipariş durumu güncellendi.');
        await loadOrders();
      } catch (e) {
        setStatus(e.message, true);
      }
    });
  });

  return wrap;
}

async function loadOrders() {
  if (!token) { els.orders.textContent = 'Önce admin girişi yapmalısın.'; return; }
  try {
    const data = await api('/api/admin/orders');
    const orders = data.orders || [];
    els.orders.innerHTML = '';
    if (!orders.length) {
      els.orders.textContent = 'Henüz sipariş yok.';
      return;
    }
    orders.forEach((o) => els.orders.appendChild(orderRow(o)));
  } catch (e) {
    els.orders.textContent = e.message;
  }
}

function moduleRow(type, item) {
  const wrap = document.createElement('div');
  wrap.className = 'cart-line';
  wrap.innerHTML = `
    <div>
      <strong>${item.title}</strong>
      <small>${type} · code: ${item.code}</small>
    </div>
    <div class="qty-controls">
      <button data-type="${type}" data-code="${item.code}" data-enabled="true" class="ghost">Aktif</button>
      <button data-type="${type}" data-code="${item.code}" data-enabled="false" class="danger">Pasif</button>
    </div>
  `;

  wrap.querySelectorAll('[data-type]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await api(`/api/admin/modules/${btn.getAttribute('data-type')}/${btn.getAttribute('data-code')}`, {
          method: 'PUT',
          body: JSON.stringify({ enabled: btn.getAttribute('data-enabled') === 'true' })
        });
        setStatus('Modül güncellendi.');
        await loadModules();
      } catch (e) {
        setStatus(e.message, true);
      }
    });
  });

  return wrap;
}

async function loadModules() {
  if (!token) { els.modules.textContent = 'Önce admin girişi yapmalısın.'; return; }
  try {
    const data = await api('/api/admin/modules');
    els.modules.innerHTML = '<h3>Kargo</h3>';
    (data.shippingMethods || []).forEach((m) => els.modules.appendChild(moduleRow('shipping', m)));
    const pTitle = document.createElement('h3');
    pTitle.textContent = 'Ödeme';
    els.modules.appendChild(pTitle);
    (data.paymentMethods || []).forEach((m) => els.modules.appendChild(moduleRow('payment', m)));
  } catch (e) {
    els.modules.textContent = e.message;
  }
}

function pageRow(page) {
  const wrap = document.createElement('div');
  wrap.className = 'cart-line';
  wrap.innerHTML = `
    <div>
      <strong>${page.title}</strong>
      <small>slug: ${page.slug}</small>
      <div style="margin-top:6px;">${page.content || ''}</div>
    </div>
    <div class="qty-controls">
      <button data-pedit="${page.id}" class="ghost">Düzenle</button>
      <button data-pdel="${page.id}" class="danger">Sil</button>
    </div>
  `;

  wrap.querySelector('[data-pedit]').addEventListener('click', async () => {
    const content = prompt('Yeni içerik', page.content || '');
    if (content === null) return;
    try {
      await api(`/api/admin/pages/${page.id}`, { method: 'PUT', body: JSON.stringify({ content }) });
      setStatus('Sayfa güncellendi.');
      await loadPages();
    } catch (e) { setStatus(e.message, true); }
  });

  wrap.querySelector('[data-pdel]').addEventListener('click', async () => {
    try {
      await api(`/api/admin/pages/${page.id}`, { method: 'DELETE' });
      setStatus('Sayfa silindi.');
      await loadPages();
    } catch (e) { setStatus(e.message, true); }
  });

  return wrap;
}

async function loadPages() {
  if (!token) { els.pages.textContent = 'Önce admin girişi yapmalısın.'; return; }
  try {
    const data = await api('/api/admin/pages');
    const pages = data.pages || [];
    els.pages.innerHTML = '';
    if (!pages.length) {
      els.pages.textContent = 'Sayfa yok.';
      return;
    }
    pages.forEach((p) => els.pages.appendChild(pageRow(p)));
  } catch (e) {
    els.pages.textContent = e.message;
  }
}

els.loginBtn.addEventListener('click', async () => {
  try {
    const data = await api('/api/admin/login', { method: 'POST', headers: {}, body: JSON.stringify({ email: els.email.value.trim(), password: els.password.value.trim() }) });
    token = data.token;
    localStorage.setItem('mini_admin_token', token);
    setLoginStatus('Giriş başarılı.');
    await Promise.all([loadProducts(), loadCategories(), loadOrders(), loadModules(), loadPages()]);
  } catch (e) { setLoginStatus(e.message, true); }
});

els.form.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    await api('/api/admin/products', {
      method: 'POST',
      body: JSON.stringify({
        name: document.getElementById('new-name').value.trim(),
        price: Number(document.getElementById('new-price').value),
        category: document.getElementById('new-category').value || 'genel',
        image: document.getElementById('new-image').value.trim() || '/assets/images/products/tshirt.svg',
        description: document.getElementById('new-description').value.trim()
      })
    });
    setStatus('Yeni ürün eklendi.');
    els.form.reset();
    await loadProducts();
  } catch (e) { setStatus(e.message, true); }
});

els.categoryForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const name = document.getElementById('category-name').value.trim();
    await api('/api/admin/categories', { method: 'POST', body: JSON.stringify({ name }) });
    setStatus('Kategori eklendi.');
    els.categoryForm.reset();
    await loadCategories();
  } catch (e) { setStatus(e.message, true); }
});

els.pageForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    await api('/api/admin/pages', {
      method: 'POST',
      body: JSON.stringify({
        title: document.getElementById('page-title').value.trim(),
        slug: document.getElementById('page-slug').value.trim(),
        content: document.getElementById('page-content').value.trim()
      })
    });
    setStatus('Sayfa eklendi.');
    els.pageForm.reset();
    await loadPages();
  } catch (e) { setStatus(e.message, true); }
});

if (token) {
  Promise.all([loadProducts(), loadCategories(), loadOrders(), loadModules(), loadPages()]);
} else {
  loadProducts();
  loadOrders();
  loadModules();
  loadPages();
}
