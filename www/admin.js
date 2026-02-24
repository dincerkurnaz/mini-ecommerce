const config = window.__APP_CONFIG__ || { apiBaseUrl: 'http://localhost:3001' };
let token = localStorage.getItem('mini_admin_token') || '';

const els = {
  email: document.getElementById('admin-email'),
  password: document.getElementById('admin-password'),
  loginBtn: document.getElementById('login-btn'),
  loginStatus: document.getElementById('login-status'),
  list: document.getElementById('admin-products'),
  status: document.getElementById('admin-status'),
  form: document.getElementById('new-product-form')
};

function setStatus(message, isError = false) {
  els.status.textContent = message;
  els.status.style.color = isError ? '#b00020' : '#0a7a2f';
}

function setLoginStatus(message, isError = false) {
  els.loginStatus.textContent = message;
  els.loginStatus.style.color = isError ? '#b00020' : '#0a7a2f';
}

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
      <small>${product.category} · ${Number(product.price).toFixed(2)} TRY</small>
      <div style="margin-top:6px;">${product.description || ''}</div>
    </div>
    <div class="qty-controls">
      <button data-edit="${product.id}" class="ghost">Düzenle</button>
      <button data-del="${product.id}" class="danger">Sil</button>
    </div>
  `;

  wrap.querySelector('[data-del]').addEventListener('click', async () => {
    try {
      await api(`/api/admin/products/${product.id}`, { method: 'DELETE' });
      setStatus('Ürün silindi.');
      await loadProducts();
    } catch (e) {
      setStatus(e.message, true);
    }
  });

  wrap.querySelector('[data-edit]').addEventListener('click', async () => {
    const name = prompt('Yeni ürün adı', product.name);
    if (!name) return;
    const price = prompt('Yeni fiyat', String(product.price));
    if (!price) return;

    try {
      await api(`/api/admin/products/${product.id}`, {
        method: 'PUT',
        body: JSON.stringify({ name, price: Number(price) })
      });
      setStatus('Ürün güncellendi.');
      await loadProducts();
    } catch (e) {
      setStatus(e.message, true);
    }
  });

  return wrap;
}

async function loadProducts() {
  if (!token) {
    els.list.innerHTML = 'Önce admin girişi yapmalısın.';
    return;
  }

  try {
    const data = await api('/api/admin/products');
    const products = data.products || [];
    els.list.innerHTML = '';
    if (!products.length) {
      els.list.textContent = 'Ürün bulunamadı.';
      return;
    }
    products.forEach((p) => els.list.appendChild(row(p)));
  } catch (e) {
    els.list.innerHTML = '';
    setStatus(e.message, true);
  }
}

els.loginBtn.addEventListener('click', async () => {
  try {
    const email = els.email.value.trim();
    const password = els.password.value.trim();
    const data = await api('/api/admin/login', {
      method: 'POST',
      headers: {},
      body: JSON.stringify({ email, password })
    });
    token = data.token;
    localStorage.setItem('mini_admin_token', token);
    setLoginStatus('Giriş başarılı.');
    loadProducts();
  } catch (e) {
    setLoginStatus(e.message, true);
  }
});

els.form.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    await api('/api/admin/products', {
      method: 'POST',
      body: JSON.stringify({
        name: document.getElementById('new-name').value.trim(),
        price: Number(document.getElementById('new-price').value),
        category: document.getElementById('new-category').value.trim(),
        image: document.getElementById('new-image').value.trim() || '/assets/images/products/tshirt.svg',
        description: document.getElementById('new-description').value.trim()
      })
    });
    setStatus('Yeni ürün eklendi.');
    els.form.reset();
    await loadProducts();
  } catch (e) {
    setStatus(e.message, true);
  }
});

loadProducts();
