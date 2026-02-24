const config = window.__APP_CONFIG__ || { apiBaseUrl: 'http://localhost:3001' };
const STORAGE_KEY = 'mini_cart_v2';
const CUSTOMER_TOKEN_KEY = 'mini_customer_token';
const COUPONS = { WELCOME10: 0.1, MINI50: 50 };

let products = [];
let SHIPPING = { standard: 79.9, express: 129.9 };

const state = {
  cart: new Map(),
  couponCode: '',
  shippingMethod: 'standard',
  paymentMethod: 'mock_card',
  customerToken: localStorage.getItem(CUSTOMER_TOKEN_KEY) || ''
};

const els = {
  cartItems: document.getElementById('cart-items'),
  subtotal: document.getElementById('subtotal'),
  shipping: document.getElementById('shipping'),
  discount: document.getElementById('discount'),
  total: document.getElementById('grand-total'),
  status: document.getElementById('status'),
  checkoutBtn: document.getElementById('checkout-btn'),
  couponInput: document.getElementById('coupon-input'),
  applyCouponBtn: document.getElementById('apply-coupon-btn'),
  checkoutForm: document.getElementById('checkout-form'),
  paymentMethod: document.getElementById('payment-method'),
  shippingMethods: document.getElementById('shipping-methods'),
  memberBenefitBox: document.getElementById('member-benefit-box')
};

function formatTRY(value) { return `${value.toFixed(2)} TRY`; }

function setStatus(message, isError = false) {
  els.status.textContent = message;
  els.status.style.color = isError ? '#b00020' : '#0a7a2f';
}

function authHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (state.customerToken) headers.Authorization = `Bearer ${state.customerToken}`;
  return headers;
}

function persistCart() {
  const payload = {
    items: [...state.cart.entries()],
    couponCode: state.couponCode,
    shippingMethod: state.shippingMethod,
    paymentMethod: state.paymentMethod
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function loadCart() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    (parsed.items || []).forEach(([productId, quantity]) => {
      if (Number(quantity) > 0) state.cart.set(productId, Number(quantity));
    });
    if (parsed.couponCode) {
      state.couponCode = parsed.couponCode;
      els.couponInput.value = parsed.couponCode;
    }
    if (parsed.shippingMethod) state.shippingMethod = parsed.shippingMethod;
    if (parsed.paymentMethod) state.paymentMethod = parsed.paymentMethod;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function computeTotals() {
  const items = [...state.cart.entries()]
    .map(([productId, quantity]) => {
      const product = products.find((p) => p.id === productId);
      if (!product) return null;
      return {
        productId,
        name: product.name,
        unitPrice: Number(product.price),
        quantity,
        lineTotal: Number(product.price) * quantity
      };
    })
    .filter(Boolean);

  const subtotal = items.reduce((sum, i) => sum + i.lineTotal, 0);
  const shipping = items.length ? Number(SHIPPING[state.shippingMethod] || 0) : 0;

  let discount = 0;
  if (state.couponCode && COUPONS[state.couponCode]) {
    const rule = COUPONS[state.couponCode];
    discount = rule < 1 ? subtotal * rule : rule;
    if (discount > subtotal) discount = subtotal;
  }

  const total = Math.max(0, subtotal + shipping - discount);
  return { items, subtotal, shipping, discount, total };
}

function renderCart() {
  const { items, subtotal, shipping, discount, total } = computeTotals();

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
        const next = (state.cart.get(id) || 1) - 1;
        if (next <= 0) state.cart.delete(id);
        else state.cart.set(id, next);
        persistCart();
        renderCart();
      });
    });

    els.cartItems.querySelectorAll('[data-inc]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-inc');
        state.cart.set(id, (state.cart.get(id) || 0) + 1);
        persistCart();
        renderCart();
      });
    });

    els.cartItems.querySelectorAll('[data-del]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.cart.delete(btn.getAttribute('data-del'));
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

async function hydrateCheckoutFromUser() {
  if (!state.customerToken) {
    if (els.memberBenefitBox) els.memberBenefitBox.style.display = 'block';
    return;
  }
  try {
    const res = await fetch(`${config.apiBaseUrl}/api/auth/me`, { headers: authHeaders() });
    if (!res.ok) {
      if (els.memberBenefitBox) els.memberBenefitBox.style.display = 'block';
      return;
    }
    const data = await res.json();
    document.getElementById('customer-name').value = data.user?.name || '';
    document.getElementById('customer-email').value = data.user?.email || '';
    if (els.memberBenefitBox) els.memberBenefitBox.style.display = 'none';
  } catch {
    if (els.memberBenefitBox) els.memberBenefitBox.style.display = 'block';
  }
}

async function checkout(event) {
  event.preventDefault();
  if (state.cart.size === 0) return;

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
      headers: authHeaders(),
      body: JSON.stringify({
        cartId: cartData.cartId,
        customer: {
          name: document.getElementById('customer-name').value.trim(),
          email: document.getElementById('customer-email').value.trim(),
          phone: document.getElementById('customer-phone').value.trim(),
          address: document.getElementById('customer-address').value.trim()
        },
        shippingMethod: state.shippingMethod,
        paymentMethod: state.paymentMethod,
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
    await hydrateCheckoutFromUser();
  } catch (error) {
    setStatus(error.message || 'Checkout sırasında hata oluştu.', true);
  }
}

async function loadProductsFromApi() {
  const res = await fetch(`${config.apiBaseUrl}/api/products`);
  const data = await res.json();
  products = data.products || [];
}

async function loadCheckoutMethodsFromApi() {
  const res = await fetch(`${config.apiBaseUrl}/api/config/checkout-methods`);
  const data = await res.json();
  const shippingMethods = data.shippingMethods || [];
  const paymentMethods = data.paymentMethods || [];

  if (shippingMethods.length) {
    SHIPPING = Object.fromEntries(shippingMethods.map((m) => [m.code, Number(m.price || 0)]));
    els.shippingMethods.innerHTML = shippingMethods.map((m) =>
      `<label><input type="radio" name="shipping" value="${m.code}" ${m.code === state.shippingMethod ? 'checked' : ''} /> ${m.title} (${formatTRY(Number(m.price || 0))})</label>`
    ).join('');

    if (!SHIPPING[state.shippingMethod]) {
      state.shippingMethod = shippingMethods[0].code;
    }
  }

  if (paymentMethods.length) {
    els.paymentMethod.innerHTML = paymentMethods.map((m) => `<option value="${m.code}">${m.title}</option>`).join('');
    if (!paymentMethods.some((m) => m.code === state.paymentMethod)) {
      state.paymentMethod = paymentMethods[0].code;
    }
    els.paymentMethod.value = state.paymentMethod;
  }
}

function wireEvents() {
  els.shippingMethods.addEventListener('change', (e) => {
    if (e.target && e.target.name === 'shipping') {
      state.shippingMethod = e.target.value;
      persistCart();
      renderCart();
    }
  });

  els.paymentMethod.addEventListener('change', (e) => {
    state.paymentMethod = e.target.value;
    persistCart();
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

async function bootstrap() {
  await Promise.all([loadProductsFromApi(), loadCheckoutMethodsFromApi()]);
  loadCart();
  await hydrateCheckoutFromUser();
  wireEvents();
  renderCart();
}

bootstrap();
