const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
const port = process.env.PORT || 3001;

const allowedOrigins = (process.env.CORS_ORIGINS || 'http://www.localhost:3000,http://127.0.0.1:3000,http://localhost:3000,https://www.example.com')
  .split(',').map((v) => v.trim()).filter(Boolean);

const adminEmail = process.env.ADMIN_EMAIL || 'admin@mini.local';
const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
const SESSION_TTL_MS = 1000 * 60 * 60 * 12;
const ADMIN_MAX_ATTEMPTS = Number(process.env.ADMIN_MAX_ATTEMPTS || 5);
const ADMIN_LOCK_MS = Number(process.env.ADMIN_LOCK_MS || 15 * 60 * 1000);

const productsPath = path.join(__dirname, 'data', 'products.json');
const categoriesPath = path.join(__dirname, 'data', 'categories.json');
const ordersPath = path.join(__dirname, 'data', 'orders.json');
const modulesPath = path.join(__dirname, 'data', 'modules.json');
const pagesPath = path.join(__dirname, 'data', 'pages.json');
const campaignsPath = path.join(__dirname, 'data', 'campaigns.json');
const usersPath = path.join(__dirname, 'data', 'users.json');
const sessionsPath = path.join(__dirname, 'data', 'sessions.json');
const authStatePath = path.join(__dirname, 'data', 'auth_state.json');
const auditLogPath = path.join(__dirname, 'data', 'audit.log');

app.use(cors({ origin(origin, callback) { if (!origin || allowedOrigins.includes(origin)) return callback(null, true); return callback(new Error('CORS blocked for origin: ' + origin)); } }));
app.use(express.json({ limit: '100kb' }));

const carts = new Map();

function slugify(text = '') {
  return String(text)
    .toLowerCase()
    .replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'urun';
}

function readJson(filePath, fallback = []) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    if (Array.isArray(fallback)) return Array.isArray(parsed) ? parsed : fallback;
    if (typeof fallback === 'object') return parsed && typeof parsed === 'object' ? parsed : fallback;
    return parsed;
  } catch { return fallback; }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

function readProducts() { return readJson(productsPath, []); }
function writeProducts(data) { writeJson(productsPath, data); }
function readCategories() { return readJson(categoriesPath, []); }
function writeCategories(data) { writeJson(categoriesPath, data); }
function readOrders() { return readJson(ordersPath, []); }
function writeOrders(data) { writeJson(ordersPath, data); }
function readModules() {
  return readJson(modulesPath, { shippingMethods: [], paymentMethods: [] });
}
function writeModules(data) { writeJson(modulesPath, data); }
function readPages() { return readJson(pagesPath, []); }
function writePages(data) { writeJson(pagesPath, data); }
function readCampaigns() { return readJson(campaignsPath, []); }
function writeCampaigns(data) { writeJson(campaignsPath, data); }
function readUsers() { return readJson(usersPath, []); }
function writeUsers(data) { writeJson(usersPath, data); }
function readSessions() { return readJson(sessionsPath, []); }
function writeSessions(data) { writeJson(sessionsPath, data); }
function readAuthState() { return readJson(authStatePath, { adminFails: {} }); }
function writeAuthState(data) { writeJson(authStatePath, data); }

function audit(event, details = {}) {
  const line = JSON.stringify({ at: new Date().toISOString(), event, ...details });
  fs.appendFileSync(auditLogPath, line + '\n', 'utf-8');
}

function toMoney(value) { return Math.round((value + Number.EPSILON) * 100) / 100; }

function calculateCartTotals(items) {
  const catalog = readProducts();
  let subtotal = 0;
  const normalizedItems = items.map((rawItem) => {
    const product = catalog.find((p) => p.id === rawItem.productId);
    if (!product) throw new Error(`Geçersiz ürün: ${rawItem.productId}`);

    const quantity = Number(rawItem.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) throw new Error(`Geçersiz adet (${rawItem.productId}): ${rawItem.quantity}`);

    const variantCode = rawItem.variantCode ? String(rawItem.variantCode) : null;
    const variant = variantCode ? (product.variants || []).find((v) => v.code === variantCode) : null;
    if (variantCode && !variant) throw new Error(`Geçersiz varyant: ${variantCode}`);

    const availableStock = Number(product.stock || 0);
    if (quantity > availableStock) throw new Error(`Stok yetersiz (${product.name}). Mevcut: ${availableStock}`);

    const unitPrice = toMoney(Number(product.price) + Number(variant?.priceDelta || 0));
    const lineTotal = toMoney(unitPrice * quantity);
    subtotal = toMoney(subtotal + lineTotal);

    return {
      productId: product.id,
      variantCode,
      name: product.name,
      unitPrice,
      quantity,
      lineTotal
    };
  });

  const shipping = subtotal >= 1000 ? 0 : 79.9;
  const total = toMoney(subtotal + shipping);
  return { items: normalizedItems, subtotal, shipping, total, currency: 'TRY' };
}

function cleanExpiredSessions() {
  const now = Date.now();
  const active = readSessions().filter((s) => Number(s.expiresAt || 0) > now);
  writeSessions(active);
  return active;
}

function createSession(role, payload = {}) {
  const token = crypto.randomBytes(24).toString('hex');
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const sessions = cleanExpiredSessions();
  sessions.push({ token, role, expiresAt, ...payload });
  writeSessions(sessions);
  return { token, expiresAt };
}

function getSessionByToken(token, role) {
  if (!token) return null;
  const sessions = cleanExpiredSessions();
  return sessions.find((s) => s.token === token && s.role === role) || null;
}

function requireAdmin(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const session = getSessionByToken(token, 'admin');
  if (!session) return res.status(401).json({ error: 'Yetkisiz erişim' });
  req.admin = session;
  return next();
}

function parseBearerToken(req) {
  const auth = req.headers.authorization || '';
  return auth.startsWith('Bearer ') ? auth.slice(7) : null;
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function adminAttemptKey(email, ip) {
  return `${normalizeEmail(email)}|${ip || 'unknown'}`;
}

function getAdminFailRecord(key) {
  const state = readAuthState();
  return state.adminFails[key] || { count: 0, lockUntil: 0 };
}

function setAdminFailRecord(key, record) {
  const state = readAuthState();
  state.adminFails[key] = record;
  writeAuthState(state);
}

function clearAdminFailRecord(key) {
  const state = readAuthState();
  delete state.adminFails[key];
  writeAuthState(state);
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const hashedAttempt = crypto.scryptSync(password, salt, 64);
  const hashBuffer = Buffer.from(hash, 'hex');
  if (hashBuffer.length !== hashedAttempt.length) return false;
  return crypto.timingSafeEqual(hashBuffer, hashedAttempt);
}

function getCustomerFromRequest(req) {
  const token = parseBearerToken(req);
  const session = getSessionByToken(token, 'customer');
  if (!session) return null;
  const user = readUsers().find((u) => u.id === session.userId);
  if (!user) return null;
  return { token, session, user };
}

function requireCustomer(req, res, next) {
  const customer = getCustomerFromRequest(req);
  if (!customer) return res.status(401).json({ error: 'Yetkisiz erişim' });
  req.customer = customer;
  return next();
}

app.get('/health', (_, res) => res.status(200).json({ status: 'ok', service: 'mini-ecommerce-api' }));

app.get('/api/products', (req, res) => {
  const { category, q } = req.query;
  let products = readProducts();
  if (category) products = products.filter((p) => (p.categorySlug || slugify(p.category || '')) === category);
  if (q) {
    const needle = String(q).toLowerCase();
    products = products.filter((p) => p.name.toLowerCase().includes(needle) || (p.description || '').toLowerCase().includes(needle));
  }
  res.status(200).json({ products });
});

app.get('/api/products/:slug', (req, res) => {
  const product = readProducts().find((p) => p.slug === req.params.slug);
  if (!product) return res.status(404).json({ error: 'Ürün bulunamadı' });
  return res.status(200).json({ product });
});

app.get('/api/categories', (_, res) => res.status(200).json({ categories: readCategories() }));
app.get('/api/campaigns', (_, res) => res.status(200).json({ campaigns: readCampaigns().filter((c) => c.enabled) }));
app.get('/api/pages', (_, res) => res.status(200).json({ pages: readPages() }));
app.get('/api/pages/:slug', (req, res) => {
  const page = readPages().find((p) => p.slug === req.params.slug);
  if (!page) return res.status(404).json({ error: 'Sayfa bulunamadı' });
  return res.status(200).json({ page });
});

app.get('/api/config/checkout-methods', (_, res) => {
  const modules = readModules();
  res.status(200).json({
    shippingMethods: (modules.shippingMethods || []).filter((m) => m.enabled),
    paymentMethods: (modules.paymentMethods || []).filter((m) => m.enabled)
  });
});

app.post('/api/cart', (req, res) => {
  try {
    const { items } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'Sepet boş olamaz.' });
    const totals = calculateCartTotals(items);
    const cartId = crypto.randomUUID();
    carts.set(cartId, { id: cartId, ...totals, createdAt: new Date().toISOString() });
    return res.status(201).json({ cartId, ...totals });
  } catch (error) { return res.status(400).json({ error: error.message || 'Sepet oluşturulamadı.' }); }
});

app.get('/api/cart/:cartId', (req, res) => {
  const cart = carts.get(req.params.cartId);
  if (!cart) return res.status(404).json({ error: 'Sepet bulunamadı.' });
  return res.status(200).json(cart);
});

app.post('/api/checkout', (req, res) => {
  const { cartId, customer, shippingMethod, paymentMethod, couponCode } = req.body || {};
  const cart = carts.get(cartId);
  if (!cart) return res.status(404).json({ error: 'Checkout için geçerli bir cartId gerekli.' });
  if (!customer || !customer.email) return res.status(400).json({ error: 'Müşteri e-posta bilgisi zorunludur.' });

  const modules = readModules();
  const selectedShipping = (modules.shippingMethods || []).find((m) => m.code === (shippingMethod || 'standard') && m.enabled);
  const selectedPayment = (modules.paymentMethods || []).find((m) => m.code === (paymentMethod || 'mock_card') && m.enabled);
  if (!selectedShipping) return res.status(400).json({ error: 'Geçersiz veya pasif kargo yöntemi.' });
  if (!selectedPayment) return res.status(400).json({ error: 'Geçersiz veya pasif ödeme yöntemi.' });

  const products = readProducts();
  for (const item of cart.items) {
    const pIdx = products.findIndex((p) => p.id === item.productId);
    if (pIdx < 0) return res.status(400).json({ error: `Ürün bulunamadı: ${item.productId}` });
    const currentStock = Number(products[pIdx].stock || 0);
    if (item.quantity > currentStock) {
      return res.status(400).json({ error: `${products[pIdx].name} için stok yetersiz.` });
    }
    products[pIdx].stock = currentStock - item.quantity;
  }

  const activeCampaigns = readCampaigns().filter((c) => c.enabled);
  const selectedCampaign = couponCode ? activeCampaigns.find((c) => c.name.toUpperCase() === String(couponCode).toUpperCase()) : null;

  const orderId = 'ord_' + crypto.randomBytes(6).toString('hex');
  const paidAt = new Date().toISOString();
  const authenticatedCustomer = getCustomerFromRequest(req);
  const order = {
    id: orderId,
    status: 'paid',
    amount: cart.total,
    currency: cart.currency,
    items: cart.items,
    customer,
    shippingMethod: selectedShipping.code,
    paymentMethod: selectedPayment.code,
    couponCode: couponCode || null,
    campaignId: selectedCampaign ? selectedCampaign.id : null,
    userId: authenticatedCustomer ? authenticatedCustomer.user.id : null,
    userEmail: authenticatedCustomer ? authenticatedCustomer.user.email : null,
    createdAt: paidAt,
    paidAt
  };

  writeProducts(products);
  const orders = readOrders();
  orders.unshift(order);
  writeOrders(orders);

  return res.status(200).json({
    orderId,
    status: 'paid',
    amount: cart.total,
    currency: cart.currency,
    customerEmail: customer.email,
    paidAt,
    message: 'Ödeme başarıyla alındı.'
  });
});

app.post('/api/admin/login', (req, res) => {
  const { email, password } = req.body || {};
  const key = adminAttemptKey(email, req.ip);
  const fail = getAdminFailRecord(key);

  if (fail.lockUntil && Date.now() < fail.lockUntil) {
    audit('admin_login_blocked', { email: normalizeEmail(email), ip: req.ip, lockUntil: fail.lockUntil });
    return res.status(429).json({ error: 'Çok fazla başarısız deneme. Lütfen daha sonra tekrar deneyin.' });
  }

  if (email !== adminEmail || password !== adminPassword) {
    const count = Number(fail.count || 0) + 1;
    const lockUntil = count >= ADMIN_MAX_ATTEMPTS ? Date.now() + ADMIN_LOCK_MS : 0;
    setAdminFailRecord(key, { count, lockUntil, updatedAt: Date.now() });
    audit('admin_login_failed', { email: normalizeEmail(email), ip: req.ip, count, lockUntil });
    return res.status(401).json({ error: 'Geçersiz giriş bilgisi' });
  }

  clearAdminFailRecord(key);
  const { token, expiresAt } = createSession('admin', { email: normalizeEmail(email) });
  audit('admin_login_success', { email: normalizeEmail(email), ip: req.ip, expiresAt });
  return res.status(200).json({ token, expiresAt });
});

app.post('/api/auth/register', (req, res) => {
  const { name, email, password } = req.body || {};
  const normalizedEmail = normalizeEmail(email);
  const normalizedName = String(name || '').trim();
  if (!normalizedName || !normalizedEmail || !password) {
    return res.status(400).json({ error: 'name, email ve password zorunludur' });
  }
  if (!normalizedEmail.includes('@')) return res.status(400).json({ error: 'Geçerli bir e-posta girin' });
  if (String(password).length < 6) return res.status(400).json({ error: 'Şifre en az 6 karakter olmalı' });

  const users = readUsers();
  if (users.some((u) => u.email === normalizedEmail)) return res.status(409).json({ error: 'Bu e-posta zaten kayıtlı' });

  const now = new Date().toISOString();
  const user = {
    id: 'u-' + crypto.randomBytes(6).toString('hex'),
    name: normalizedName,
    email: normalizedEmail,
    passwordHash: hashPassword(String(password)),
    createdAt: now,
    updatedAt: now
  };
  users.push(user);
  writeUsers(users);

  const { token, expiresAt } = createSession('customer', { userId: user.id });
  audit('customer_register', { userId: user.id, email: user.email, ip: req.ip });
  return res.status(201).json({ token, expiresAt, user: { id: user.id, name: user.name, email: user.email } });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !password) return res.status(400).json({ error: 'email ve password zorunludur' });

  const user = readUsers().find((u) => u.email === normalizedEmail);
  if (!user || !verifyPassword(String(password), user.passwordHash)) return res.status(401).json({ error: 'Geçersiz giriş bilgisi' });

  const { token, expiresAt } = createSession('customer', { userId: user.id });
  audit('customer_login_success', { userId: user.id, email: user.email, ip: req.ip });
  return res.status(200).json({ token, expiresAt, user: { id: user.id, name: user.name, email: user.email } });
});

app.get('/api/auth/me', requireCustomer, (req, res) => {
  const { user, session } = req.customer;
  return res.status(200).json({ user: { id: user.id, name: user.name, email: user.email }, expiresAt: session.expiresAt });
});

app.get('/api/auth/orders', requireCustomer, (req, res) => {
  const { user } = req.customer;
  const orders = readOrders().filter((order) => order.userId === user.id || order.userEmail === user.email);
  return res.status(200).json({ orders });
});

app.get('/api/admin/products', requireAdmin, (_, res) => res.status(200).json({ products: readProducts() }));
app.get('/api/admin/categories', requireAdmin, (_, res) => res.status(200).json({ categories: readCategories() }));
app.get('/api/admin/modules', requireAdmin, (_, res) => res.status(200).json(readModules()));
app.get('/api/admin/pages', requireAdmin, (_, res) => res.status(200).json({ pages: readPages() }));
app.get('/api/admin/campaigns', requireAdmin, (_, res) => res.status(200).json({ campaigns: readCampaigns() }));

app.post('/api/admin/categories', requireAdmin, (req, res) => {
  const { name } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Kategori adı zorunlu' });
  const categories = readCategories();
  const slug = slugify(name);
  if (categories.some((c) => c.slug === slug)) return res.status(400).json({ error: 'Kategori zaten var' });
  const category = { id: 'c-' + crypto.randomBytes(3).toString('hex'), name: String(name), slug };
  categories.push(category);
  writeCategories(categories);
  res.status(201).json({ category });
});

app.delete('/api/admin/categories/:id', requireAdmin, (req, res) => {
  const categories = readCategories();
  const next = categories.filter((c) => c.id !== req.params.id);
  if (next.length === categories.length) return res.status(404).json({ error: 'Kategori bulunamadı' });
  writeCategories(next);
  res.status(200).json({ ok: true });
});

app.post('/api/admin/products', requireAdmin, (req, res) => {
  const { name, price, category, description, image } = req.body || {};
  if (!name || !price) return res.status(400).json({ error: 'name ve price zorunlu' });

  const products = readProducts();
  const slugBase = slugify(name);
  const suffix = products.filter((p) => p.slug && p.slug.startsWith(slugBase)).length + 1;
  const slug = suffix > 1 ? `${slugBase}-${suffix}` : slugBase;

  const categorySlug = slugify(category || 'genel');
  const product = {
    id: 'p-' + Math.floor(100 + Math.random() * 900),
    name: String(name),
    slug,
    price: Number(price),
    currency: 'TRY',
    category: String(category || 'genel'),
    categorySlug,
    description: String(description || ''),
    image: String(image || '/assets/images/products/tshirt.svg')
  };
  products.push(product);
  writeProducts(products);
  res.status(201).json({ product });
});

app.put('/api/admin/products/:id', requireAdmin, (req, res) => {
  const products = readProducts();
  const idx = products.findIndex((p) => p.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'Ürün bulunamadı' });

  const current = products[idx];
  const nextName = req.body.name !== undefined ? String(req.body.name) : current.name;
  const nextCategory = req.body.category !== undefined ? String(req.body.category) : current.category;

  products[idx] = {
    ...current,
    ...req.body,
    id: current.id,
    name: nextName,
    slug: req.body.name ? slugify(nextName) : current.slug,
    category: nextCategory,
    categorySlug: slugify(nextCategory),
    price: req.body.price !== undefined ? Number(req.body.price) : current.price
  };
  writeProducts(products);
  res.status(200).json({ product: products[idx] });
});

app.delete('/api/admin/products/:id', requireAdmin, (req, res) => {
  const products = readProducts();
  const next = products.filter((p) => p.id !== req.params.id);
  if (next.length === products.length) return res.status(404).json({ error: 'Ürün bulunamadı' });
  writeProducts(next);
  res.status(200).json({ ok: true });
});

app.put('/api/admin/modules/:type/:code', requireAdmin, (req, res) => {
  const { type, code } = req.params;
  const { enabled } = req.body || {};
  if (typeof enabled !== 'boolean') return res.status(400).json({ error: 'enabled boolean olmalı' });

  const modules = readModules();
  const key = type === 'shipping' ? 'shippingMethods' : type === 'payment' ? 'paymentMethods' : null;
  if (!key) return res.status(400).json({ error: 'Geçersiz modül tipi' });

  const idx = (modules[key] || []).findIndex((m) => m.code === code);
  if (idx < 0) return res.status(404).json({ error: 'Modül bulunamadı' });

  modules[key][idx] = { ...modules[key][idx], enabled };
  writeModules(modules);
  res.status(200).json({ module: modules[key][idx] });
});

app.post('/api/admin/pages', requireAdmin, (req, res) => {
  const { title, slug, content } = req.body || {};
  if (!title || !slug) return res.status(400).json({ error: 'title ve slug zorunlu' });
  const pages = readPages();
  if (pages.some((p) => p.slug === slug)) return res.status(400).json({ error: 'slug zaten kullanılıyor' });
  const page = { id: 'pg-' + crypto.randomBytes(3).toString('hex'), title, slug, content: content || '', updatedAt: new Date().toISOString() };
  pages.push(page);
  writePages(pages);
  res.status(201).json({ page });
});

app.put('/api/admin/pages/:id', requireAdmin, (req, res) => {
  const pages = readPages();
  const idx = pages.findIndex((p) => p.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'Sayfa bulunamadı' });
  pages[idx] = { ...pages[idx], ...req.body, id: pages[idx].id, updatedAt: new Date().toISOString() };
  writePages(pages);
  res.status(200).json({ page: pages[idx] });
});

app.delete('/api/admin/pages/:id', requireAdmin, (req, res) => {
  const pages = readPages();
  const next = pages.filter((p) => p.id !== req.params.id);
  if (next.length === pages.length) return res.status(404).json({ error: 'Sayfa bulunamadı' });
  writePages(next);
  res.status(200).json({ ok: true });
});

app.post('/api/admin/campaigns', requireAdmin, (req, res) => {
  const { name, type, value } = req.body || {};
  if (!name || !type || value === undefined) return res.status(400).json({ error: 'name/type/value zorunlu' });
  const campaigns = readCampaigns();
  const campaign = {
    id: 'cmp-' + crypto.randomBytes(3).toString('hex'),
    name: String(name).toUpperCase(),
    type,
    value: Number(value),
    enabled: true,
    updatedAt: new Date().toISOString()
  };
  campaigns.push(campaign);
  writeCampaigns(campaigns);
  res.status(201).json({ campaign });
});

app.put('/api/admin/campaigns/:id', requireAdmin, (req, res) => {
  const campaigns = readCampaigns();
  const idx = campaigns.findIndex((c) => c.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'Kampanya bulunamadı' });
  campaigns[idx] = { ...campaigns[idx], ...req.body, updatedAt: new Date().toISOString() };
  writeCampaigns(campaigns);
  res.status(200).json({ campaign: campaigns[idx] });
});

app.get('/api/admin/reports/summary', requireAdmin, (_, res) => {
  const orders = readOrders();
  const products = readProducts();
  const totalRevenue = orders.reduce((sum, o) => sum + Number(o.amount || 0), 0);
  const totalOrders = orders.length;
  const lowStockCount = products.filter((p) => Number(p.stock || 0) <= 10).length;
  res.status(200).json({
    totalRevenue: toMoney(totalRevenue),
    totalOrders,
    lowStockCount,
    topProducts: products
      .map((p) => {
        const sold = orders.reduce((sum, o) => sum + (o.items || []).filter((i) => i.productId === p.id).reduce((s, i) => s + Number(i.quantity || 0), 0), 0);
        return { id: p.id, name: p.name, sold };
      })
      .sort((a, b) => b.sold - a.sold)
      .slice(0, 5)
  });
});

app.get('/api/admin/orders', requireAdmin, (_, res) => {
  res.status(200).json({ orders: readOrders() });
});

app.put('/api/admin/orders/:id/status', requireAdmin, (req, res) => {
  const { status } = req.body || {};
  const allowed = ['pending', 'paid', 'shipped', 'cancelled'];
  if (!allowed.includes(status)) return res.status(400).json({ error: 'Geçersiz durum' });

  const orders = readOrders();
  const idx = orders.findIndex((o) => o.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'Sipariş bulunamadı' });

  orders[idx] = { ...orders[idx], status, updatedAt: new Date().toISOString() };
  writeOrders(orders);
  res.status(200).json({ order: orders[idx] });
});

app.use((err, _, res, __) => res.status(500).json({ error: err.message || 'Beklenmeyen bir hata oluştu.' }));

app.listen(port, () => console.log(`mini-ecommerce API listening on http://localhost:${port}`));
