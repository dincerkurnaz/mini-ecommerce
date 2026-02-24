const config = window.__APP_CONFIG__ || {
  apiBaseUrl: 'http://localhost:3001',
  cdnBaseUrl: 'http://localhost:3002'
};

let products = [];

const STORAGE_KEY = 'mini_cart_v2';
const COUPONS = { WELCOME10: 0.1, MINI50: 50 };
const SHIPPING = { standard: 79.9, express: 129.9 };

const state = {
  cart: new Map(),
  couponCode: '',
  shippingMethod: 'standard',
  query: '',
  sort: 'featured'
};

const els = {
  list: document.getElementById('product-list'),
  cartItems: document.getElementById('cart-items'),
  headerCount: document.getElementById('header-cart-count'),
  subtotal: document.getElementById('subtotal'),
  shipping: document.getElementById('shipping'),
  discount: document.getElementById('discount'),
  total: document.getElementById('grand-total'),
  status: document.getElementById('status'),
  checkoutBtn: document.getElementById('checkout-btn'),
  searchInput: document.getElementById('search-input'),
  sortSelect: document.getElementById('sort-select'),
  couponInput: document.getElementById('coupon-input'),
  applyCouponBtn: document.getElementById('apply-coupon-btn'),
  checkoutForm: document.getElementById('checkout-form')
};

function formatTRY(value) {
  return `${value.toFixed(2)} TRY`;
}

function setStatus(message, isError = false) {
  els.status.textContent = message;
  els.status.style.color = isError ? '#b00020' : '#0a7a2f';
}

function persistCart() {
  const payload = {
    items: [...state.cart.entries()],
    couponCode: state.couponCode,
    shippingMethod: state.shippingMethod
  };
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
    if (parsed.couponCode && COUPONS[parsed.couponCode]) {
      state.couponCode = parsed.couponCode;
      els.couponInput.value = parsed.couponCode;
    }
    if (parsed.shippingMethod && SHIPPING[parsed.shippingMethod]) {
      state.shippingMethod = parsed.shippingMethod;
      const radio = document.querySelector(`input[name="shipping"][value="${parsed.shippingMethod}"]`);
      if (radio) radio.checked = true;
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function getVisibleProducts() {
  let result = [...products];

  if (state.query.trim()) {
    const q = state.query.toLowerCase();
    result = result.filter((p) => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q));
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
  renderCart();

  const product = products.find((p) => p.id === productId);
  setStatus(`${product.name} sepete eklendi.`);
}

function updateQuantity(productId, next) {
  if (next <= 0) {
    state.cart.delete(productId);
  } else {
    state.cart.set(productId, next);
  }
  persistCart();
  renderCart();
}

function computeTotals() {
  const items = [...state.cart.entries()]
    .map(([productId, quantity]) => {
      const product = products.find((p) => p.id === productId);
      if (!product) return null;
      return {
        productId,
        name: product.name,
        unitPrice: product.price,
        quantity,
        lineTotal: product.price * quantity
      };
    })
    .filter(Boolean);

  const subtotal = items.reduce((sum, i) => sum + i.lineTotal, 0);
  const shipping = state.cart.size === 0 ? 0 : SHIPPING[state.shippingMethod];

  let discount = 0;
  if (state.couponCode && COUPONS[state.couponCode]) {
    const rule = COUPONS[state.couponCode];
    discount = rule < 1 ? subtotal * rule : rule;
    if (discount > subtotal) discount = subtotal;
  }

  const total = Math.max(0, subtotal + shipping - discount);
  return { items, subtotal, shipping, discount, total };
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
      <img src="${config.cdnBaseUrl}${product.image}" alt="${product.name}" loading="lazy" />
      <h3>${product.name}</h3>
      <p>${product.description}</p>
      <div class="product-meta">
        <span class="pill">${product.category}</span>
        <strong>${formatTRY(product.price)}</strong>
      </div>
      <button data-add="${product.id}">Sepete Ekle</button>
    `;
    card.querySelector('button').addEventListener('click', () => addToCart(product.id));
    els.list.appendChild(card);
  });
}

function renderCart() {
  const { items, subtotal, shipping, discount, total } = computeTotals();
  const totalCount = items.reduce((sum, item) => sum + item.quantity, 0);
  els.headerCount.textContent = String(totalCount);

  if (!items.length) {
    els.cartItems.textContent = 'Henüz ürün eklenmedi.';
    els.checkoutBtn.disabled = true;
  } else {
    els.checkoutBtn.disabled = false;
    els.cartItems.innerHTML = items.map((item) => `
      <div class="cart-line">
        <div>
          <strong>${item.name}</strong>
          <small>${formatTRY(item.unitPrice)}</small>
        </div>
        <div class="qty-controls">
          <button data-dec="${item.productId}" class="ghost">-</button>
          <span>${item.quantity}</span>
          <button data-inc="${item.productId}" class="ghost">+</button>
          <button data-del="${item.productId}" class="danger">Sil</button>
        </div>
      </div>
    `).join('');

    els.cartItems.querySelectorAll('[data-dec]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-dec');
        updateQuantity(id, (state.cart.get(id) || 1) - 1);
      });
    });

    els.cartItems.querySelectorAll('[data-inc]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-inc');
        updateQuantity(id, (state.cart.get(id) || 0) + 1);
      });
    });

    els.cartItems.querySelectorAll('[data-del]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-del');
        state.cart.delete(id);
        persistCart();
        renderCart();
      });
    });
  }

  els.subtotal.textContent = formatTRY(subtotal);
  els.shipping.textContent = formatTRY(shipping);
  els.discount.textContent = `- ${formatTRY(discount)}`;
  els.total.textContent = formatTRY(total);
}

function validateCheckoutForm() {
  const name = document.getElementById('customer-name').value.trim();
  const email = document.getElementById('customer-email').value.trim();
  const phone = document.getElementById('customer-phone').value.trim();
  const address = document.getElementById('customer-address').value.trim();

  if (!name || !email || !phone || !address) return 'Lütfen tüm müşteri alanlarını doldur.';
  if (!email.includes('@')) return 'Geçerli bir e-posta gir.';
  if (phone.length < 10) return 'Geçerli bir telefon numarası gir.';
  return null;
}

async function checkout(event) {
  event.preventDefault();

  if (state.cart.size === 0) {
    setStatus('Sepet boş, önce ürün ekle.', true);
    return;
  }

  const formError = validateCheckoutForm();
  if (formError) {
    setStatus(formError, true);
    return;
  }

  const { items, total } = computeTotals();

  try {
    const cartResponse = await fetch(`${config.apiBaseUrl}/api/cart`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: items.map((i) => ({ productId: i.productId, quantity: i.quantity })) })
    });

    if (!cartResponse.ok) throw new Error('Sepet API çağrısı başarısız');
    const cartData = await cartResponse.json();

    const checkoutResponse = await fetch(`${config.apiBaseUrl}/api/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cartId: cartData.cartId,
        customer: {
          name: document.getElementById('customer-name').value.trim(),
          email: document.getElementById('customer-email').value.trim(),
          phone: document.getElementById('customer-phone').value.trim(),
          address: document.getElementById('customer-address').value.trim()
        },
        shippingMethod: state.shippingMethod,
        couponCode: state.couponCode,
        frontendTotal: total
      })
    });

    if (!checkoutResponse.ok) throw new Error('Checkout API çağrısı başarısız');
    const checkoutData = await checkoutResponse.json();

    setStatus(`Sipariş alındı: ${checkoutData.orderId} (${formatTRY(checkoutData.amount)})`);
    state.cart.clear();
    state.couponCode = '';
    els.couponInput.value = '';
    persistCart();
    renderCart();
    els.checkoutForm.reset();
  } catch (error) {
    setStatus(error.message || 'Checkout sırasında hata oluştu.', true);
  }
}

function wireEvents() {
  els.searchInput.addEventListener('input', (e) => {
    state.query = e.target.value;
    renderProducts();
  });

  els.sortSelect.addEventListener('change', (e) => {
    state.sort = e.target.value;
    renderProducts();
  });

  document.querySelectorAll('input[name="shipping"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      state.shippingMethod = radio.value;
      persistCart();
      renderCart();
    });
  });

  els.applyCouponBtn.addEventListener('click', () => {
    const code = els.couponInput.value.trim().toUpperCase();
    if (!code) {
      state.couponCode = '';
      setStatus('Kupon temizlendi.');
    } else if (!COUPONS[code]) {
      setStatus('Geçersiz kupon kodu.', true);
      return;
    } else {
      state.couponCode = code;
      setStatus(`Kupon uygulandı: ${code}`);
    }

    persistCart();
    renderCart();
  });

  els.checkoutForm.addEventListener('submit', checkout);
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

async function bootstrap() {
  await loadProductsFromApi();
  loadCart();
  wireEvents();
  renderProducts();
  renderCart();
}

bootstrap();
