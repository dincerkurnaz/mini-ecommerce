const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
const port = process.env.PORT || 3001;

const allowedOrigins = (process.env.CORS_ORIGINS || 'http://www.localhost:3000,http://127.0.0.1:3000,http://localhost:3000,https://www.example.com')
  .split(',')
  .map((v) => v.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('CORS blocked for origin: ' + origin));
  }
}));
app.use(express.json({ limit: '100kb' }));

const catalog = [
  { id: 'p-101', name: 'Minimal Beyaz T-Shirt', price: 499.9, currency: 'TRY' },
  { id: 'p-102', name: 'Kanvas Günlük Çanta', price: 899.9, currency: 'TRY' },
  { id: 'p-103', name: 'Paslanmaz Çelik Matara', price: 349.9, currency: 'TRY' }
];

const carts = new Map();

function toMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function calculateCartTotals(items) {
  let subtotal = 0;

  const normalizedItems = items.map((rawItem) => {
    const product = catalog.find((p) => p.id === rawItem.productId);
    if (!product) {
      throw new Error(`Geçersiz ürün: ${rawItem.productId}`);
    }

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

  return {
    items: normalizedItems,
    subtotal,
    shipping,
    total,
    currency: 'TRY'
  };
}

app.get('/health', (_, res) => {
  res.status(200).json({ status: 'ok', service: 'mini-ecommerce-api' });
});

app.get('/api/products', (_, res) => {
  res.status(200).json({ products: catalog });
});

app.post('/api/cart', (req, res) => {
  try {
    const { items } = req.body || {};

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Sepet boş olamaz.' });
    }

    const totals = calculateCartTotals(items);
    const cartId = crypto.randomUUID();

    carts.set(cartId, {
      id: cartId,
      ...totals,
      createdAt: new Date().toISOString()
    });

    return res.status(201).json({
      cartId,
      ...totals
    });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Sepet oluşturulamadı.' });
  }
});

app.get('/api/cart/:cartId', (req, res) => {
  const cart = carts.get(req.params.cartId);
  if (!cart) {
    return res.status(404).json({ error: 'Sepet bulunamadı.' });
  }
  return res.status(200).json(cart);
});

app.post('/api/checkout', (req, res) => {
  const { cartId, customer } = req.body || {};
  const cart = carts.get(cartId);

  if (!cart) {
    return res.status(404).json({ error: 'Checkout için geçerli bir cartId gerekli.' });
  }

  if (!customer || !customer.email) {
    return res.status(400).json({ error: 'Müşteri e-posta bilgisi zorunludur.' });
  }

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

app.use((err, _, res, __) => {
  res.status(500).json({ error: err.message || 'Beklenmeyen bir hata oluştu.' });
});

app.listen(port, () => {
  console.log(`mini-ecommerce API listening on http://localhost:${port}`);
});
