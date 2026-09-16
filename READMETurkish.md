# LogFinder

AI destekli, Elasticsearch tabanlı log arama ve analitik arayüzü.

LogFinder, operasyonel logları hızlıca filtrelemek, analiz etmek ve doğal dil ile sorgulamak için tasarlanmıştır. Uygulama, Elasticsearch üzerinde salt-okuma erişimle çalışır; kullanıcılar index pattern'lerini, zaman alanlarını, filtreleri ve AI asistanı üzerinden sorgu oluşturabilir.

## Özellikler

- Elasticsearch indeksleri ve alan haritaları üzerinden hızlı keşif
- Index pattern önerileri ve view yönetimi
- Zaman aralığı, filtre ve metin tabanlı arama
- AI destekli doğal dil sorgulama
- Histogram ve zaman serisi görünümü
- Sayfalı sonuçlar ve "devam/sonraki sayfa" akışı
- Görünür alan seçimi ve tablo odaklı log görselleştirme
- Kurumsal AI / OpenAI uyumlu / Gemini / OpenRouter / özel sağlayıcı desteği
- Kullanıcı kimlik bilgileri ve API anahtarları tarayıcıda yerel olarak yönetilir

## Teknoloji Yığını

- Next.js 14
- React 18
- TypeScript
- Tailwind CSS
- Zustand
- Elasticsearch REST API
- AI sağlayıcı entegrasyonu (kurumsal, OpenAI uyumlu, Gemini, OpenRouter, özel)

## Uygulama Özeti

LogFinder, ana akışta şu mantıkla çalışır:

1. Kullanıcı Elasticsearch profili ve index view'ini tanımlar.
2. Uygulama index mapping ve field caps bilgilerini çeker.
3. Kullanıcı, zaman aralığı ve filtrelerle arama yapar.
4. AI asistanı kullanıcı isteğini yorumlar ve Elasticsearch için güvenli, kontrollü sorgu planı üretir.
5. Sunucu tarafı sorguyu çalıştırır, toplam sonuç ve histogram döndürür.
6. Sonuçlar kullanıcıya özetlenir ve gerektiğinde sonraki sayfaya geçilir.

## Proje Yapısı

```text
.
├── app/
│   ├── api/
│   │   ├── ai/
│   │   │   └── chat/
│   │   └── es/
│   │       ├── defaults/
│   │       ├── fields/
│   │       ├── histogram/
│   │       ├── indices/
│   │       ├── search/
│   │       └── test/
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── ChatPanel.tsx
│   ├── Explorer.tsx
│   └── SettingsDialog.tsx
├── lib/
│   ├── ai-server.ts
│   ├── client.ts
│   ├── date-tr.ts
│   ├── defaults.ts
│   ├── es-server.ts
│   ├── store.ts
│   ├── theme.ts
│   └── types.ts
├── next.config.mjs
├── package.json
├── postcss.config.mjs
├── tailwind.config.ts
├── tsconfig.json
├── next-env.d.ts
├── README.md
└── READMETurkish.md
```

## Ön Koşullar

- Node.js 18+
- npm veya yarn
- Çalışan Elasticsearch cluster veya erişilebilir bir ES endpoint
- AI sağlayıcısına erişim (kurumsal AI, OpenAI, OpenRouter, Gemini veya özel endpoint)

## Kurulum

1. Depoyu klonlayın:

```bash
git clone <repo-url>
cd LogFinder
```

2. Bağımlılıkları yükleyin:

```bash
npm install
```

3. Çevre değişkenlerini oluşturun:

```bash
copy .env.example .env.local
```

Eğer `.env.example` yoksa aşağıdaki örneği `.env.local` dosyasına ekleyin:

```env
# Elasticsearch defaults (opsiyonel)
ELASTIC_URL=https://your-elasticsearch-host:9200
ELASTIC_USERNAME=your-username
ELASTIC_PASSWORD=your-password
ELASTIC_PATTERN=logs-*
ELASTIC_TIME_FIELD=@timestamp
DEFAULT_VIEW_PATTERNS=logs-*,app-logs-*,nginx-*,audit-*
DEFAULT_TIME_FIELD=@timestamp

# AI defaults (opsiyonel)
AI_BASE_URL=https://your-ai-endpoint
AI_USERNAME=your-username
AI_NODE_NAME=producer
AI_BOT=your-bot
AI_VERSION=latest
```

> Not: Güvenlik nedeniyle kimlik bilgileri repo içinde tutulmaz; kullanıcının ayarlar ekranından veya `.env.local` üzerinden local ortamda sağlanır.

4. Uygulamayı başlatın:

```bash
npm run dev
```

Uygulama varsayılan olarak şu adreste çalışır:

```text
http://localhost:3000
```

## Çalıştırma Komutları

```bash
# Geliştirme modu
npm run dev

# Production build
npm run build

# Production sunucu
npm run start

# Lint
npm run lint
```

## Kullanım

### 1. Elasticsearch Profili Ayarlama

- Ayarlar menüsünden Elasticsearch bölümüne girin.
- Elasticsearch URL, kullanıcı adı ve şifre veya API anahtarını girin.
- Varsayılan index pattern ve zaman alanını belirtin.

### 2. View Oluşturma

- Sol panelde mevcut view'leri seçin veya yeni bir view oluşturun.
- Index pattern ve time field değerlerini düzenleyin.
- Kaydet butonuyla view'i saklayın.

### 3. Alanları Keşfetme

- Alanlar bölümünde index içindeki alanları görürsünüz.
- İstediğiniz alanları görünür yapıp gizleyebilirsiniz.
- Field caps üzerinden searchable ve aggregatable alanları destekleyerek arama stratejinizi yönlendirin.

### 4. AI ile Sorgu

- Chat paneline doğal dil ile soru sorun.
- Örnekler:
  - "Son 2 saat içinde ERROR loglarını göster"
  - "Nginx 5xx hatalarını bul"
  - "Bu günün en yoğun saatlerdeki hataları analiz et"
  - "level=ERROR ve message içinde timeout olan kayıtları getir"

AI, Elasticsearch sorgusunu güvenli şekilde oluşturur; uygulama istemci/serverside düzenlemelerle arama sonucunu döndürür.

## Güvenlik Notları

- SQL benzeri veya mutation içeren işlemler desteklenmez.
- Elasticsearch erişim katmanı yalnızca izin verilen salt-okuma endpoint'lerine izin verir.
- Yalnızca GET istekleri kullanılır; POST/PUT/DELETE gibi değişiklik eylemleri arka planda engellenir.
- Kullanıcı kimlik bilgileri ve API anahtarları tarayıcı depolama alanında tutulur; repo içine gömülmez.
- `.env.local` dosyası yerelde tutulmalıdır; version kontrolüne eklenmemelidir.

## Dizin ve Arama Mantığı

- `lib/es-server.ts` içinde Elasticsearch erişimi güvenli şekilde tanımlanmıştır.
- `buildBoolQuery()` fonksiyonu zaman filtrelerini ve boolean arama şartlarını standartlaştırır.
- `searchLogs()` işlemi `search_after` tabanlı sayfalama kullanır.
- `histogram()` fonksiyonu zaman serisi verisini üretir.
- `lib/ai-server.ts` içinde AI asistanı, provider'ı çağırır ve ES sorgusunu planlar.

## Sorun Giderme

### Elasticsearch bağlantı hatası alıyorum

- `ELASTIC_URL` ve kimlik bilgilerini kontrol edin.
- Cluster erişiminizin ağdan açık olduğundan emin olun.
- `insecure` ayarını gerekiyorsa doğrulayın.

### AI yanıtı dönmüyor

- AI endpoint URL'sini kontrol edin.
- Model adı ve erişim anahtarını doğrulayın.
- Kurumsal AI sağlayıcısının uygun bot ve sürüm bilgilerini girin.

### Index yok veya pattern hatası

- Pattern'leri doğru yazdığınızdan emin olun.
- `_cat/indices` üzerinden indeksleri doğrulayın.
- `DEFAULT_VIEW_PATTERNS` ve `ELASTIC_PATTERN` değerlerini kontrol edin.

## Geliştirme İçin Öneriler

- UI/UX ve arama deneyimini iyileştirmek için filtre kimlikleri ve preset aralıkları eklenebilir.
- Ana tablo için daha zengin kolon sıralaması ve durum filtresi eklenebilir.
- Log çıktısında JSON formatting ve nested field expansion geliştirilebilir.
- Kullanıcı davranış analizi için arama geçmişi ve sık kullanılan filtre kayıtları eklenebilir.

## Lisans

Bu proje özel kullanım ve geliştirme amacıyla hazırlanmıştır. Lütfen lisans koşullarını proje sahibiyle teyit edin.

## Katkı

Katkı önerileri ve iyileştirme fikirleri için pull request açabilir veya proje sahipleriyle iletişime geçebilirsiniz.

---

LogFinder, operasyon ekipleri için hızlı, güvenli ve AI destekli bir log keşif aracı olarak tasarlanmıştır.
