# Temporal'ı npx ile geçici çalıştırma

Evet, mümkün. Temporal'ın CLI'ı tam da bunun için var.

## Hızlı başlangıç

Temporal'ın resmi CLI'ı zaten bir geliştirme sunucusu içeriyor — ek kurulum/Docker gerekmiyor:

```bash
# CLI'ı kur (tek seferlik, npx alternatifi)
brew install temporal
# veya
curl -sSf https://temporal.download/cli.sh | sh
```

Sonra:

```bash
temporal server start-dev
```

Bu komut bellek-içi (in-memory) bir Temporal sunucusu başlatır. Süreç kapanınca her şey silinir — tam istediğin "geçici" davranış. Web UI de `http://localhost:8233` üzerinden otomatik açılır.

## npx ile saf Node.js yaklaşımı

Eğer projende Node varsa ve dış binary istemiyorsan:

```bash
npx @temporalio/create my-app
cd my-app
npm install
npm run start.watch    # worker
npm run workflow       # workflow tetikle
```

Ama dikkat: `@temporalio/*` paketleri **client + worker SDK**'sıdır, sunucu değildir. Yani SDK'yı npx ile çekebilirsin ama Temporal sunucusu için yine `temporal server start-dev` çalıştırman lazım. İkisi farklı şeyler.

## Minimalist mimari önerisi

İş süreçlerini yönetmek için tipik kurulum şöyle olur:

```
┌─────────────┐      ┌──────────────────┐      ┌──────────┐
│ Senin app'in│─────▶│ Temporal Server  │◀─────│  Worker  │
│  (client)   │      │  (start-dev)     │      │ (Node.js)│
└─────────────┘      └──────────────────┘      └──────────┘
```

Üç parça:
1. **Temporal sunucusu** — `temporal server start-dev` (geçici, bellek-içi)
2. **Worker** — workflow ve activity'leri çalıştıran Node process'i
3. **Client** — workflow'u tetikleyen senin uygulaman

Hepsi tek makinede, tek terminal setiyle çalışır. Production'a geçerken sadece sunucuyu kalıcı bir Temporal Cloud veya self-hosted instance ile değiştirirsin, kod aynı kalır.

## Gerçekten "geçici" istiyorsan

Workflow state'inin process kapanınca silinmesini istiyorsan `start-dev` zaten bunu yapıyor. Ama state'i korumak istersen:

```bash
temporal server start-dev --db-filename ./temporal.db
```

SQLite dosyasına yazar, container/sunucu yeniden başlasa bile kayıp olmaz.

## Ne zaman bu yaklaşım yetmez

Temporal cidden güçlü bir araç ama overhead'i var. Eğer iş süreçlerin:
- Birkaç adımdan ibaretse,
- Saatlerce/günlerce süren bekleme yoksa,
- Retry/timeout/compensation mantığı kritik değilse,

bir job queue (BullMQ, pg-boss) muhtemelen daha minimalist olur. Temporal'ın gerçek değeri uzun süreli, durable, retry'li workflow'larda ortaya çıkıyor.

Hangi tür süreçleri yönetmeyi düşünüyorsun? Use case'e göre Temporal mı yoksa daha hafif bir alternatif mi mantıklı söyleyebilirim.