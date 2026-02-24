const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
const port = process.env.PORT || 3001;

const allowedOrigins = (process.env.CORS_ORIGINS || 'http://www.localhost:3000,http://127.0.0.1:3000,http://localhost:3000,https://www.example.com')
  .split(',')
  .map((v) => v.trim())
  .filter(Boolean);

const adminEmail = process.env.ADMIN_EMAIL || 'admin@mini.local';
const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
const adminSessions = new Map();
const SESSION_TTL_MS = 1000 * 60 * 60 * 12;

const dataPath = path.join(__dirname, 'data', 'products.json');

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('CORS blocked for origin: ' + origin));
  }
}));
app.use(express.json({ limit: '100kb' }));

function readProducts() {
  try {
    const raw = fs.readFileSync(dataPath, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeProducts(products) {
  fs.writeFileSync(dataPath, JSON.stringify(products, null, 2), 'utf-8');
}

function toMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function calculateCartTotals(items) {
  const catalog = readProducts();
  let subtotal = 0;

  const normalizedItems = items.map((rawItem) => {
    const product = catalog.find((p) => p.id === rawItem.productId);
    if (!product) throw new Error(`Geçersiz ürün: ${rawItem.productId}`);

    const quantity = Number(rawItem.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
      throw new Error(`Geçersiz adet (${rawItem.productId}): ${rawItem.quantity}`);
    }

    const lineTotal = toMoney(product.price * quantity);
    subtotal = toMoney(subtotal + lineTotal);

    return {
      productId: product.id,
      name: product.name,
      unitPrice: product.price,
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
  for (const [token, session] of adminSessions.entries()) {
    if (session.expiresAt <= now) adminSessions.delete(token);
  }
}

function requireAdmin(req, res, next) {
  cleanExpiredSessions();
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token || !adminSessions.has(token)) {
    return res.status(401).json({ error: 'Yetkisiz erişim' });
  }
  req.admin = adminSessions.get(token);
  return next();
}

const carts = new Map();

app.get('/health', (_, res) => {
  res.status(200).json({ status: 'ok', service: 'mini-ecommerce-api' });
});

app.get('/api/products', (_, res) => {
  res.status(200).json({ products: readProducts() });
});

app.post('/api/cart', (req, res) => {
  try {
    const { items } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Sepet boş olamaz.' });
    }

    const totals = calculateCartTotals(items);
    const cartId = crypto.randomUUID();

    carts.set(cartId, { id: cartId, ...totals, createdAt: new Date().toISOString() });
    return res.status(201).json({ cartId, ...totals });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Sepet oluşturulamadı.' });
  }
});

app.get('/api/cart/:cartId', (req, res) => {
  const cart = carts.get(req.params.cartId);
  if (!cart) return res.status(404).json({ error: 'Sepet bulunamadı.' });
  return res.status(200).json(cart);
});

app.post('/api/checkout', (req, res) => {
  const { cartId, customer } = req.body || {};
  const cart = carts.get(cartId);

  if (!cart) return res.status(404).json({ error: 'Checkout için geçerli bir cartId gerekli.' });
  if (!customer || !customer.email) return res.status(400).json({ error: 'Müşteri e-posta bilgisi zorunludur.' });

  const orderId = 'ord_' + crypto.randomBytes(6).toString('hex');
  return res.status(200).json({
    orderId,
    status: 'mock_paid',
    amount: cart.total,
    currency: cart.currency,
    customerEmail: customer.email,
    paidAt: new Date().toISOString(),
    message: 'Bu bir mock checkout yanıtıdır. Gerçek ödeme alınmadı.'
  });
});

app.post('/api/admin/login', (req, res) => {
  const { email, password } = req.body || {};
  if (email !== adminEmail || password !== adminPassword) {
    return res.status(401).json({ error: 'Geçersiz giriş bilgisi' });
  }

  const token = crypto.randomBytes(24).toString('hex');
  const expiresAt = Date.now() + SESSION_TTL_MS;
  adminSessions.set(token, { email, expiresAt });

  return res.status(200).json({ token, expiresAt });
});

app.get('/api/admin/products', requireAdmin, (_, res) => {
  res.status(200).json({ products: readProducts() });
});

app.post('/api/admin/products', requireAdmin, (req, res) => {
  const { name, price, category, description, image } = req.body || {};
  if (!name || !price) return res.status(400).json({ error: 'name ve price zorunlu' });

  const products = readProducts();
  const product = {
    id: 'p-' + Math.floor(100 + Math.random() * 900),
    name: String(name),
    price: Number(price),
    currency: 'TRY',
    category: String(category || 'genel'),
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
  products[idx] = {
    ...current,
    ...req.body,
    id: current.id,
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

app.use((err, _, res, __) => {
  res.status(500).json({ error: err.message || 'Beklenmeyen bir hata oluştu.' });
});

app.listen(port, () => {
  console.log(`mini-ecommerce API listening on http://localhost:${port}`);
});
