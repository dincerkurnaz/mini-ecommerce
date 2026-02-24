const config = window.__APP_CONFIG__ || { apiBaseUrl: 'http://localhost:3001' };
const CUSTOMER_TOKEN_KEY = 'mini_customer_token';

const state = {
  token: localStorage.getItem(CUSTOMER_TOKEN_KEY) || sessionStorage.getItem(CUSTOMER_TOKEN_KEY) || '',
  user: null
};

const els = {
  loginForm: document.getElementById('customer-login-form'),
  registerForm: document.getElementById('customer-register-form'),
  loginEmail: document.getElementById('customer-login-email'),
  loginPassword: document.getElementById('customer-login-password'),
  loginRemember: document.getElementById('customer-login-remember'),
  registerName: document.getElementById('customer-register-name'),
  registerEmail: document.getElementById('customer-register-email'),
  registerPassword: document.getElementById('customer-register-password'),
  status: document.getElementById('customer-auth-status'),
  authState: document.getElementById('customer-auth-state'),
  authEmpty: document.getElementById('customer-auth-empty'),
  authUser: document.getElementById('customer-auth-user'),
  logoutBtn: document.getElementById('customer-logout-btn'),
  ordersCount: document.getElementById('my-orders-count'),
  ordersList: document.getElementById('my-orders-list')
};

function setStatus(message, isError = false) {
  els.status.textContent = message;
  els.status.style.color = isError ? '#b00020' : '#0a7a2f';
}

function authHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  return headers;
}

function setSession(token, user, rememberMe = false) {
  state.token = token;
  state.user = user;
  if (token) {
    if (rememberMe) {
      localStorage.setItem(CUSTOMER_TOKEN_KEY, token);
      sessionStorage.removeItem(CUSTOMER_TOKEN_KEY);
    } else {
      sessionStorage.setItem(CUSTOMER_TOKEN_KEY, token);
      localStorage.removeItem(CUSTOMER_TOKEN_KEY);
    }
  } else {
    localStorage.removeItem(CUSTOMER_TOKEN_KEY);
    sessionStorage.removeItem(CUSTOMER_TOKEN_KEY);
  }
}

function renderAuth() {
  const logged = !!state.user;
  els.authState.style.display = logged ? 'block' : 'none';
  els.authEmpty.style.display = logged ? 'none' : 'block';
  els.loginForm.style.display = logged ? 'none' : 'grid';
  els.registerForm.style.display = logged ? 'none' : 'grid';
  if (logged) els.authUser.textContent = `${state.user.name} (${state.user.email})`;
}

function renderOrders(orders) {
  els.ordersCount.textContent = `Toplam sipariş: ${orders.length}`;
  if (!orders.length) {
    els.ordersList.textContent = 'Henüz sipariş yok.';
    return;
  }

  els.ordersList.innerHTML = orders.map((o) => {
    const items = (o.items || []).map((i) => `${i.name || i.productId} x${i.quantity}`).join(', ');
    const date = o.createdAt ? new Date(o.createdAt).toLocaleString('tr-TR') : '-';
    return `
      <div class="cart-line">
        <div>
          <strong>${o.id}</strong>
          <small>${o.status} · ${Number(o.amount).toFixed(2)} ${o.currency}</small>
          <div style="margin-top:6px;"><b>Tarih:</b> ${date}</div>
          <div><b>Ürünler:</b> ${items || '-'}</div>
          <div><b>Kargo/Ödeme:</b> ${o.shippingMethod || '-'} / ${o.paymentMethod || '-'}</div>
        </div>
      </div>
    `;
  }).join('');
}

async function syncSession() {
  if (!state.token) {
    state.user = null;
    renderAuth();
    renderOrders([]);
    return;
  }

  try {
    const meRes = await fetch(`${config.apiBaseUrl}/api/auth/me`, { headers: authHeaders() });
    if (!meRes.ok) throw new Error('Oturum süresi doldu');
    const meData = await meRes.json();
    state.user = meData.user || null;

    const ordersRes = await fetch(`${config.apiBaseUrl}/api/auth/orders`, { headers: authHeaders() });
    const ordersData = await ordersRes.json();
    renderOrders(ordersData.orders || []);
  } catch {
    setSession('', null);
    renderOrders([]);
  }

  renderAuth();
}

async function login(event) {
  event.preventDefault();
  try {
    const rememberMe = !!els.loginRemember.checked;
    const res = await fetch(`${config.apiBaseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: els.loginEmail.value.trim(), password: els.loginPassword.value.trim(), rememberMe })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Giriş başarısız');
    setSession(data.token, data.user, rememberMe);
    els.loginForm.reset();
    setStatus('Giriş başarılı.');
    await syncSession();
  } catch (e) {
    setStatus(e.message, true);
  }
}

async function register(event) {
  event.preventDefault();
  try {
    const res = await fetch(`${config.apiBaseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: els.registerName.value.trim(),
        email: els.registerEmail.value.trim(),
        password: els.registerPassword.value.trim(),
        rememberMe: true
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Kayıt başarısız');
    setSession(data.token, data.user, true);
    els.registerForm.reset();
    setStatus('Kayıt başarılı.');
    await syncSession();
  } catch (e) {
    setStatus(e.message, true);
  }
}

function logout() {
  setSession('', null);
  renderAuth();
  renderOrders([]);
  setStatus('Çıkış yapıldı.');
}

els.loginForm.addEventListener('submit', login);
els.registerForm.addEventListener('submit', register);
els.logoutBtn.addEventListener('click', logout);

syncSession();
