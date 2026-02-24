# Mini E-commerce (www + api + cdn)

Bu proje, üretime yakın minimal bir e-ticaret iskeletidir:
- `www` subdomain: statik storefront (3 ürün)
- `api` subdomain: ayrı Express API (cart/checkout mock)
- `cdn` subdomain: cache-friendly asset dağıtımı

## Mevcut E-Ticaret Özellikleri (Üyeliksiz)

- Misafir checkout (hesap oluşturmadan sipariş)
- Sepette adet artır/azalt/sil
- Kupon kodu (WELCOME10 / MINI50 demo)
- Kargo seçimi (standart / express)
- Arama + sıralama
- LocalStorage ile sepeti koruma (sayfa yenilense de sepet kalır)
- Checkout form doğrulaması (ad, e-posta, telefon, adres)

## Faz 1 (CMS Temeli): Admin + Ürün CRUD

- Admin giriş endpoint: `POST /api/admin/login`
- Admin ürün endpointleri:
  - `GET /api/admin/products`
  - `POST /api/admin/products`
  - `PUT /api/admin/products/:id`
  - `DELETE /api/admin/products/:id`
- Admin panel: `http://localhost:3000/admin.html`
- Varsayılan demo admin bilgisi:
  - E-posta: `admin@mini.local`
  - Şifre: `admin123`
  - (Env ile değiştir: `ADMIN_EMAIL`, `ADMIN_PASSWORD`)

## Faz 2: Kategori + Ürün Detay + Slug

- Kategori endpointleri:
  - `GET /api/categories`
  - `GET /api/admin/categories`
  - `POST /api/admin/categories`
- Ürün detay endpointi: `GET /api/products/:slug`
- Storefront kategori filtresi + ürün detay sayfası (`/product.html?slug=...`)

## Faz 3: Sipariş Kayıtları + Admin Sipariş Yönetimi

- Checkout sonrası siparişler `api/data/orders.json` içine kaydedilir.
- Admin sipariş endpointleri:
  - `GET /api/admin/orders`
  - `PUT /api/admin/orders/:id/status`
- Desteklenen durumlar: `pending`, `paid`, `shipped`, `cancelled`

## Faz 4: Ödeme/Kargo Modül Yapısı

- Modül konfigürasyonu: `api/data/modules.json`
- Public checkout method endpoint:
  - `GET /api/config/checkout-methods`
- Admin modül yönetimi endpointleri:
  - `GET /api/admin/modules`
  - `PUT /api/admin/modules/:type/:code` (`type`: `shipping` veya `payment`)
- Checkout artık yalnızca aktif modüllere izin verir.

## Faz 5: CMS Sayfa Yönetimi + SEO

- CMS sayfa verisi: `api/data/pages.json`
- Public page endpointleri:
  - `GET /api/pages`
  - `GET /api/pages/:slug`
- Admin page endpointleri:
  - `GET /api/admin/pages`
  - `POST /api/admin/pages`
  - `PUT /api/admin/pages/:id`
  - `DELETE /api/admin/pages/:id`
- Frontend ekleri:
  - `www/page.html` + `www/page.js`
  - `www/robots.txt`
  - `www/sitemap.xml`
  - ana sayfada canonical/robots/OG + JSON-LD (Organization)

## Klasör Yapısı

```txt
mini-ecommerce/
├─ api/
│  ├─ server.js
│  └─ Dockerfile
├─ www/
│  ├─ index.html
│  ├─ store.js
│  └─ nginx.conf
├─ cdn/
│  ├─ assets/
│  │  ├─ css/store.css
│  │  └─ images/products/*.svg
│  └─ nginx.conf
├─ nginx/
│  ├─ edge.conf
│  └─ subdomains.conf
├─ docker-compose.yml
└─ package.json
```

## Hızlı Başlangıç (Node)

```bash
cd mini-ecommerce
npm install
npm run dev
```

Servisler:
- `http://localhost:3000` -> www (statik)
- `http://localhost:3001` -> api (Express)
- `http://localhost:3002` -> cdn (asset)

## Docker Compose ile Çalıştırma

```bash
cd mini-ecommerce
docker compose up --build
```

`edge` servisi host üzerinden `:80` açar. Lokal subdomain test:
- `http://www.localhost`
- `http://api.localhost/health`
- `http://cdn.localhost/assets/css/store.css`

## API Endpointleri (Mock)

- `GET /health`
- `GET /api/products`
- `POST /api/cart`
- `GET /api/cart/:cartId`
- `POST /api/checkout`

Örnek sepet isteği:

```bash
curl -X POST http://localhost:3001/api/cart \
  -H "Content-Type: application/json" \
  -d '{"items":[{"productId":"p-101","quantity":2}]}'
```

## Cloudflare DNS (Exact)

Aşağıdaki kayıtları Cloudflare DNS ekranında ekleyin (örnek domain: `example.com`):

1. `A` kaydı: `www` -> `ORIGIN_IP` (Proxied: ON)
2. `A` kaydı: `api` -> `ORIGIN_IP` (Proxied: ON)
3. `A` kaydı: `cdn` -> `ORIGIN_IP` (Proxied: ON)

Alternatif (tek origin için):
- `CNAME www -> @` (Proxied ON)
- `CNAME api -> @` (Proxied ON)
- `CNAME cdn -> @` (Proxied ON)

## Cloudflare Cache/Page Rules (Exact)

Cloudflare Page Rules kullanacaksanız (sırayla):

1. URL: `https://api.example.com/*`
   - `Cache Level: Bypass`
   - `Edge Cache TTL: no-store` (varsa)
   - `Disable Performance` (opsiyonel)

2. URL: `https://cdn.example.com/*`
   - `Cache Level: Cache Everything`
   - `Edge Cache TTL: 1 month` (veya daha uzun)
   - `Browser Cache TTL: 1 month`

3. URL: `https://www.example.com/*`
   - `Cache Level: Cache Everything`
   - `Edge Cache TTL: 2 hours`
   - `Browser Cache TTL: 2 hours`

Not: `www` için HTML cache kullanılacağı için deploy sonrası Cloudflare cache purge gerekir.

## Cloudflare Cache Rules (Yeni Arayüz, Önerilen)

### Rule 1 (API bypass)
- Expression:
  ```txt
  (http.host eq "api.example.com")
  ```
- Action: `Cache eligibility -> Bypass cache`

### Rule 2 (CDN full cache)
- Expression:
  ```txt
  (http.host eq "cdn.example.com")
  ```
- Action:
  - `Cache eligibility -> Eligible for cache`
  - `Cache key -> Standard`
  - `Edge TTL -> 30 days`

### Rule 3 (WWW full cache)
- Expression:
  ```txt
  (http.host eq "www.example.com")
  ```
- Action:
  - `Cache eligibility -> Eligible for cache`
  - `Cache key -> Standard`
  - `Edge TTL -> 2 hours`

Önemli sıralama: `API bypass` kuralı en üstte olmalı.

## Origin Nginx Reverse Proxy (Subdomain)

`nginx/subdomains.conf` içinde örnek reverse proxy mevcuttur:
- `www.example.com -> www`
- `api.example.com -> api`
- `cdn.example.com -> cdn`

Gerçek sunucuda TLS için Cloudflare Origin Certificate + Nginx `listen 443 ssl` konfigürasyonu ekleyin.

## Üretim Notları

- API yanıtlarını cache'lemeyin (`api` bypass).
- CDN asset dosyalarında fingerprint (`app.8d3f1.css`) kullanın.
- `www` HTML için kısa TTL + purge stratejisi uygulayın.
- API için rate-limit/WAF kuralları ekleyin.
