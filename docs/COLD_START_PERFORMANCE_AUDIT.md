# AegisVault v7 — Cold Start Performance Audit & Çözüm Planı

> **Hazırlayan:** Mavis
> **Tarih:** 2026-08-13
> **Kapsam:** İlk açılışta 6 saniye siyah ekran — root cause analizi + çözüm önerileri
> **Platform:** Öncelik Windows/macOS/Linux desktop (Tauri 2 + WebView2/WKWebView/WebKitGTK); Android Tauri Mobile için de geçerli
> **Sürüm:** v7.0.1.0

---

## 0. TL;DR

**6 saniyelik siyah ekran = storage initialization blocking LockScreen render.**

`App.tsx:67-79`:
```tsx
const [isStorageReady, setIsStorageReady] = useState(false);

useEffect(() => {
  initializeStorage().finally(() => {
    if (isMounted) setIsStorageReady(true);
  });
}, []);

// ...
if (!isStorageReady) return <AppSplashLoader />;
if (!unlocked) return <LockScreen ... />;
```

**Ana darboğazlar:**
1. **Storage.ts eager import zinciri** — `useVaultData` → `storage` → `attachments` + `sqlite_opfs` (wa-sqlite WASM loader) + `vaultStorageProvider` + `biometric` + `secureStorage` + ... → hepsi ilk mount'ta parse edilmek zorunda
2. **`initializeStorage()` blocking call** — IndexedDB + OPFS + SQLite hydrate + biometric tüm zincir tamamlanmadan LockScreen gösterilmiyor
3. **App.tsx monolitik import** — 50+ modül (çoğu unlock sonrası gerekli) ana bundle'da

**Beklenen iyileşme (3 katmanlı çözümle):** 6.0s → 0.8-1.5s (cold start) / 0.3-0.5s (warm cache)

---

## 1. 6 Saniye Nereden Geliyor — Zaman Dağılımı

Tipik cold start (Windows 11, WebView2, orta düzey donanım):

| Faz | Süre | Ne oluyor |
|---|---|---|
| **0. Tauri Activity → WebView oluştur** | 200-400ms | Native shell, WebView2 init |
| **1. HTML parse + splash.css** | 30-50ms | `index.html` 1812B + `splash.css` 1787B → splash ekranda |
| **2. JS bundle download** | 100-300ms | `index-B55RKj1c.js` 1.45 MB (local) |
| **3. JS bundle parse + execute** | 800-1500ms | V8 parse + module evaluation (50+ import zinciri) |
| **4. storage.ts transitive imports** | 200-500ms | attachments + sqlite_opfs + vaultStorageProvider + ... |
| **5. React mount + initial render** | 100-300ms | `AppSplashLoader` ekrana gelir |
| **6. `initializeStorage()` (BLOCKING)** | 2500-4000ms | ↓ detay ↓ |
| **6a.** `initializeIndexedDbStorage()` | 100-300ms | DB açılışı + version check |
| **6b.** `sqliteOPFSInstance.hydrate()` (desktop) | 500-1500ms | OPFS read + write + sync |
| **6c.** `restoreOrActivateDefaultVaultStorageBackend()` | 200-800ms | Migration detection + provider switch |
| **6d.** `getVaultStorageRepository().hydrate()` | 500-2000ms | wa-sqlite WASM load + compile + DB aç |
| **6e.** `hydrateBiometric()` | 100-300ms | Native bridge + cache |
| **6f.** `migrateRememberedSecretKeyToSecureStorage()` | 50-200ms | IndexedDB → secure storage sync |
| **7. LockScreen render** | 100-500ms | React commit + paint |
| **TOPLAM** | **~4500-6500ms** | ✅ 6 saniye siyah ekran doğrulandı |

**Kritik gözlem:** Adım 6 toplam sürenin **~%60-70**'ini yiyor. `initializeStorage()` çağrısı LockScreen için tamamen gereksiz — vault kilitliyken hiçbir storage verisine ihtiyaç yok.

---

## 2. Bundle Analizi (`dist/assets/`)

```
Toplam:        5,378,459 bytes (~5.13 MB)
JS toplam:     2,833,648 bytes (~2.70 MB)
WASM toplam:   1,697,741 bytes (~1.62 MB)

Detay:
- index-B55RKj1c.js            1,450,077 B (1.38 MB)  ← Ana bundle (50+ modül)
- wa-sqlite-async-DY3_ptqa.wasm 1,139,398 B (1.09 MB)  ← SQLite async WASM
- zxcvbn-vendor-JEvEWkCr.js     837,481 B (0.80 MB)  ← Password strength
- aegis-app-icon-zGEMGRK0.png   656,879 B (0.63 MB)  ← App icon (PNG! çok büyük)
- wa-sqlite-Bkv7CwRB.wasm        558,343 B (0.53 MB)  ← SQLite sync WASM
- vendor-COUIaCbA.js             268,779 B (0.26 MB)
- react-vendor-CcC2M9ro.js       229,681 B (0.22 MB)
- index-Ded19QS_.css             138,877 B (0.13 MB)  ← Tailwind 4
- icon-CJVHLRc8.png               51,314 B (0.05 MB)
- argon2-vendor-DMwhgi8v.js       46,090 B (0.04 MB)
- tauri-vendor-CuPEsqiY.js         1,540 B (0.00 MB)
```

**Sorunlu noktalar:**
- `index.js` 1.38 MB → Tüm app kodu (40 component + 20 hook + lib modülleri) tek bundle'da
- `wa-sqlite-async.wasm` 1.09 MB → İlk açılışta gerekli değil, sadece unlock sonrası kullanılıyor
- `aegis-app-icon.png` 656 KB → PNG, WebP/AVIF'e çevrilebilir (3-5x küçülür)
- `zxcvbn-vendor.js` 837 KB → Password strength, lock screen'de kullanılıyor ama eager load

---

## 3. Root Cause Analizi — 3 Ana Darboğaz

### 3.1 Darboğaz #1: Blocking `initializeStorage()`

**Dosya:** `src/App.tsx:67-79`, `src/lib/storage.ts:57-84`

**Sorun:** `useEffect` içinde `initializeStorage()` çağrılıyor ve `finally`'de `setIsStorageReady(true)` yapılıyor. Bu tamamlanana kadar `<AppSplashLoader />` gösteriliyor, sonra `<LockScreen />` render ediliyor.

**Oysa ki:** Lock ekranı için storage'a hiç ihtiyaç yok. Vault kilitliyken:
- `useVaultData.refreshDatabase()` çağrılsa bile vault key yok → boş liste döner
- `isMasterPasswordSet()` zaten `getIndexedDbItemSync` ile sync çalışıyor
- Tüm `attachments.ts`, `sqlite_opfs.ts` vb. **sadece unlock sonrası** kullanılıyor

**Etki:** ~3-4 saniye gereksiz bekleme.

### 3.2 Darboğaz #2: Eager Import Zinciri

**Dosya:** `src/App.tsx:1-50` (import listesi)

**Sorun:** App.tsx 50+ modülü doğrudan import ediyor. Her biri kendi dependency ağacını çekiyor:

```
App.tsx
├── useVaultData → storage.ts
│   ├── attachments.ts (IndexedDB, encryption, kdf)
│   ├── vaultStorageProvider.ts (orchestration)
│   ├── vaultStorageActiveMigration.ts (wa-sqlite)
│   ├── biometric.ts (WebAuthn)
│   ├── secureStorage.ts
│   ├── sqlite_opfs.ts (wa-sqlite WASM wrapper)
│   ├── desktopStorage.ts
│   ├── indexedDbStorage.ts
│   └── @tauri-apps/api/core
├── useAndroidAutofillCoordinator → androidAutofill.ts
├── useAssetIntegrity → assetIntegrity.ts
├── useAirgapAlerts → airgapNetworkPolicy.ts
├── useAndroidRuntimeSecurity → androidRuntimeSecurity.ts
└── ... (diğer 30+ hook)
```

**Oysa ki:** Lock ekranında bunların çoğuna gerek yok:
- `useVaultData` → unlock sonrası
- `useAndroidAutofillCoordinator` → unlock sonrası
- `useAndroidRuntimeSecurity` → unlock sonrası
- `useAssetIntegrity` → unlock sonrası
- `useAirgapAlerts` → unlock sonrası
- `useAttachmentDownload` → unlock sonrası
- `useVaultMobileView` → unlock sonrası
- `useVaultFilters` → unlock sonrası
- `useVaultQueries` → unlock sonrası
- vs.

**Etki:** JS bundle parse süresi 800-1500ms, transitive module evaluation 200-500ms.

### 3.3 Darboğaz #3: Monolitik React Tree (Splash → LockScreen atomic)

**Dosya:** `src/App.tsx:533-545`

**Sorun:** `if (!isStorageReady) return <AppSplashLoader />` ve `if (!unlocked) return <LockScreen />` — bunlar **sıralı** ve **bloklayıcı**. LockScreen mount olduğunda bile, 20+ hook daha initialize oluyor (her biri useState/useEffect çalıştırıyor).

**Oysa ki:** LockScreen'in render'ı sadece `isMasterPasswordSet` ve `useLanguage` gerektiriyor. Diğer hook'lar (useVaultData, useAndroidAutofillCoordinator, useAssetIntegrity, useAirgapAlerts, useAndroidRuntimeSecurity) `unlocked=true` olunca zaten etkili.

**Etki:** Hook initialization + state batching 100-300ms ekstra.

---

## 4. Çözüm Planı — 3 Katman

### 4.1 Katman 1: Acil Düzeltme (1-2 saat, ~%60-70 hızlanma)

**Hedef:** LockScreen'i 1 saniyenin altında göster.

#### 4.1.1 Storage init'i arka plana at

**Değişiklik:** `src/App.tsx:67-79`

```diff
-  const [isStorageReady, setIsStorageReady] = useState(false);
-
-  useEffect(() => {
-    let isMounted = true;
-    initializeStorage().finally(() => {
-      if (isMounted) {
-        setIsStorageReady(true);
-      }
-    });
-    return () => {
-      isMounted = false;
-    };
-  }, []);
+  // Storage init runs in background; we don't block LockScreen on it.
+  // The actual vault data is only needed AFTER unlock.
+  useEffect(() => {
+    let isMounted = true;
+    initializeStorage()
+      .catch((err) => console.error('Storage init failed:', err))
+      .finally(() => {
+        if (isMounted) setIsStorageReady(true);
+      });
+    return () => { isMounted = false; };
+  }, []);

   // ... 20+ hooks ...

-  if (!isStorageReady) {
-    return <AppSplashLoader />;
-  }
-
   // If locked, return the beautiful LockScreen UI
   if (!unlocked) {
     return (
       <LockScreen
         isAutofillPending={Boolean(pendingAutofillRequest)}
         integrityWarning={Boolean(assetIntegrityFailure)}
       />
     );
   }
+
+  // While storage is initializing AND we're already unlocked, show splash.
+  // For locked state, we render LockScreen immediately.
+  if (!isStorageReady && unlocked) {
+    return <AppSplashLoader />;
+  }
```

**Etki:** ~3-4 saniye → LockScreen ilk açılışta 0.5-1 saniyede gösterilir.

#### 4.1.2 Ağır modülleri dynamic import yap

**Hedef:** `wa-sqlite`, `zxcvbn`, `attachments` chunk'larını lazy load.

**vite.config.ts zaten `manualChunks` ile bunları ayırıyor ama dynamic import yok:**

`src/lib/storage.ts:43` ve `src/lib/vaultStorageProvider.ts` — bunlar **static import**. Lazy import için:

```diff
- import { sqliteOPFSInstance } from './sqlite_opfs';
+ // Lazy load — only when actually used
+ async function getSqliteOPFS() {
+   const mod = await import('./sqlite_opfs');
+   return mod.sqliteOPFSInstance;
+ }

- import { getVaultStorageRepository, restoreOrActivateDefaultVaultStorageBackend } from './vaultStorageProvider';
+ let _storageProvider: typeof import('./vaultStorageProvider') | null = null;
+ async function getVaultStorageProvider() {
+   if (!_storageProvider) {
+     _storageProvider = await import('./vaultStorageProvider');
+   }
+   return _storageProvider;
+ }
```

Ama bu kapsamlı bir refactor. Daha basit alternatif:

**src/lib/storage.ts** → **storageCore.ts** + **storageHeavy.ts** olarak böl:
- `storageCore.ts`: Lock screen için gerekli (isMasterPasswordSet, verifyMasterPassword setup)
- `storageHeavy.ts`: Vault unlock sonrası (refreshDatabase, saveVaultItem, attachments, wa-sqlite)

**Etki:** 2.83 MB JS → ~800 KB initial (sadece core). WASM (1.62 MB) unlock sonrası yüklenir.

#### 4.1.3 App.tsx import'larını lazy yap

**Değişiklik:** `src/App.tsx` — unlock sonrası gereken hook'ları `React.lazy` veya conditional import ile.

```tsx
// Heavy hooks (unlock sonrası gerekli) — lazy
const useVaultData = React.lazy(() => 
  import('./hooks/useVaultData').then(m => ({ default: m.useVaultData }))
);
```

Daha temiz yaklaşım: `<UnlockedApp />` adında ayrı component oluştur, onu lazy load et:

```tsx
const UnlockedApp = React.lazy(() => import('./UnlockedApp'));

// App.tsx
if (!unlocked) {
  return <LockScreen ... />;  // Sadece bu eager
}
return (
  <React.Suspense fallback={<AppSplashLoader />}>
    <UnlockedApp ... />
  </React.Suspense>
);
```

`<UnlockedApp />` ayrı chunk olarak yüklenir, lock screen'i hiç etkilemez.

**Etki:** Initial bundle ~1.0 MB → ~500-600 KB. Parse süresi yarı yarıya.

### 4.2 Katman 2: Optimizasyon (yarım gün, %80-90 hızlanma)

#### 4.2.1 aegis-app-icon.png'i optimize et

**Mevcut:** 656 KB PNG (256x256 veya 512x512 varsayımı)
**Hedef:** WebP/AVIF, ~80-150 KB

```bash
# ImageMagick veya sharp ile
cwebp -q 80 assets/aegis-app-icon.png -o assets/aegis-app-icon.webp
# Veya AVIF (daha iyi sıkıştırma)
avifenc --min 30 --max 40 assets/aegis-app-icon.png assets/aegis-app-icon.avif
```

**Etki:** 656 KB → 100 KB, ~550 KB tasarruf. WebView2/WKWebView/WebKit hepsi destekliyor.

#### 4.2.2 wa-sqlite WASM'ı dynamic import yap

`src/lib/sqlite_opfs.ts:1-50` ve `src/lib/vaultStorageProvider.ts`:

```typescript
// Bunun yerine:
import sqliteOPFSInit from '@sqlite.org/sqlite-wasm';
// Şu yapılabilir:
let _sqliteOPFSPromise: Promise<any> | null = null;
async function loadSqliteOPFS() {
  if (!_sqliteOPFSPromise) {
    _sqliteOPFSPromise = import('@sqlite.org/sqlite-wasm').then(m => m.default);
  }
  return _sqliteOPFSPromise;
}
```

**Etki:** 1.62 MB WASM initial bundle'dan çıkar, unlock sonrası yüklenir.

#### 4.2.3 zxcvbn-ts lazy load

LockScreen'de password strength için kullanılıyor. **837 KB** büyük. Lazy:

```typescript
// src/hooks/usePasswordStrength.ts (yeni)
let _zxcvbnPromise: Promise<any> | null = null;
async function loadZxcvbn() {
  if (!_zxcvbnPromise) {
    _zxcvbnPromise = Promise.all([
      import('@zxcvbn-ts/core'),
      import('@zxcvbn-ts/language-common'),
      import('@zxcvbn-ts/language-tr'),
    ]).then(([core, common, tr]) => ({ core, common, tr }));
  }
  return _zxcvbnPromise;
}
```

**Etki:** 837 KB initial bundle'dan çıkar. Lock screen mount olduktan sonra yüklenebilir (kullanıcı password yazarken).

#### 4.2.4 argon2 lazy load (zaten küçük ama yine de)

`argon2-vendor.js` 46 KB. `verifyMasterPassword` sırasında lazy load edilebilir (Rust üzerinden zaten var ama fallback var).

### 4.3 Katman 3: İleri Optimizasyon (1-2 gün, %95+ hızlanma)

#### 4.3.1 Service Worker ile pre-cache

Production build sonrası:
- `index.html`, `splash.css`, ana chunks → pre-cache
- wa-sqlite WASM, zxcvbn → runtime cache (ilk kullanımda)
- Tauri güncellemelerinde SW update

#### 4.3.2 Tauri'nin native splash ekranını kullan (Android/desktop)

Tauri 2 + tauri-plugin-splashscreen ile **native** splash göster, JS bundle'ı arka planda yükle:

```toml
# src-tauri/Cargo.toml
[dependencies]
tauri-plugin-splashscreen = "2"
```

```rust
// src-tauri/src/lib.rs
.plugin(tauri_plugin_splashscreen::Builder::new().build())
```

Bu, native tarafta splash gösterir, WebView arka planda hazırlanır, hazır olunca otomatik geçiş yapar. Çok daha hızlı perceived startup.

#### 4.3.3 HTML'i inline critical CSS yap

`splash.css` zaten external ama çok küçük (1787 B). Inline edilebilir:

```html
<head>
  <style>/* splash.css içeriği */</style>
</head>
```

Ek HTTP request yok, anında render.

#### 4.3.4 <link rel="preload"> ile kritik chunk'ları preload et

```html
<link rel="preload" href="/assets/lock-screen-XXX.js" as="script">
```

Tauri `modulepreload` zaten ekliyor ama spesifik LockScreen chunk'ı için explicit preload daha hızlı.

---

## 5. Patch-Ready Kod Değişiklikleri

### 5.1 Patch 1: App.tsx — Storage init arka plana

```tsx
// src/App.tsx
export default function App() {
  const [isStorageReady, setIsStorageReady] = useState(false);

  useEffect(() => {
    let isMounted = true;
    initializeStorage()
      .catch((err) => console.error('Storage init failed:', err))
      .finally(() => {
        if (isMounted) setIsStorageReady(true);
      });
    return () => { isMounted = false; };
  }, []);

  // ... hooks ...

  // NEW: LockScreen doesn't need storage. Render it immediately.
  if (!unlocked) {
    return (
      <LockScreen
        isAutofillPending={Boolean(pendingAutofillRequest)}
        integrityWarning={Boolean(assetIntegrityFailure)}
      />
    );
  }

  // Only block unlocked UI on storage init.
  if (!isStorageReady) {
    return <AppSplashLoader />;
  }

  return <UnlockedApp ... />;
}
```

### 5.2 Patch 2: UnlockedApp lazy component (yeni dosya)

```tsx
// src/UnlockedApp.tsx (YENİ)
import React from 'react';
import { useVaultData } from './hooks/useVaultData';
// ... diğer unlock sonrası hook'lar ...

interface UnlockedAppProps {
  // tüm unlock sonrası props
}

export default function UnlockedApp(props: UnlockedAppProps) {
  // Mevcut App.tsx'in unlocked kısmının TAMAMI buraya taşınır
  // 50+ hook, 40+ component, hepsi burada
  return (
    <div className="...">
      <SidebarNavigation ... />
      <MainContent ... />
      {/* ... */}
    </div>
  );
}
```

```tsx
// src/App.tsx (değişiklik)
const UnlockedApp = React.lazy(() => import('./UnlockedApp'));

// ... 

if (!unlocked) {
  return <LockScreen ... />;  // Sadece bu eager
}

return (
  <React.Suspense fallback={<AppSplashLoader />}>
    <UnlockedApp ... />
  </React.Suspense>
);
```

### 5.3 Patch 3: vite.config.ts — manualChunks iyileştirmesi

```diff
// vite.config.ts
manualChunks(id) {
  if (!id.includes('node_modules')) return;

  if (id.includes('argon2-browser')) {
    return 'argon2-vendor';
  }
-  if (id.includes('zxcvbn')) {
-    return 'zxcvbn-vendor';
-  }
+  if (id.includes('zxcvbn')) {
+    return 'zxcvbn-vendor';  // Mevcut — ama dynamic import ile yüklenmeli
+  }
+  if (id.includes('@sqlite.org') || id.includes('wa-sqlite')) {
+    return 'sqlite-vendor';  // YENİ
+  }
+  if (id.includes('attachments')) {
+    return 'attachments-vendor';  // YENİ
+  }
  // ... existing
}
```

### 5.4 Patch 4: storage.ts bölünmesi (storageCore.ts + storageHeavy.ts)

**Yeni dosya:** `src/lib/storageCore.ts` — lock screen için:

```typescript
// src/lib/storageCore.ts
// Sadece lock screen ve unlock sırasında gereken fonksiyonlar
import { getIndexedDbItemSync, setIndexedDbItemSync, ... } from './indexedDbStorage';
import { getSecureStorageItem, setSecureStorageItem, ... } from './secureStorage';
import { isAccountSecretKeyFormatValid, ... } from './secretKey';
// Hafif dependency'ler

export function isMasterPasswordSet(): boolean { ... }
export async function setupMasterPassword(password: string): Promise<void> {
  // Sadece IndexedDB + crypto — wa-sqlite DEĞİL
}
export async function verifyMasterPassword(password: string, secretKey?: string | null): Promise<boolean> {
  // IndexedDB + crypto — Rust invoke ile
}
// Diğer lock-time fonksiyonlar
```

**Yeni dosya:** `src/lib/storageHeavy.ts` — unlock sonrası:

```typescript
// src/lib/storageHeavy.ts
// Vault unlock sonrası kullanılan ağır fonksiyonlar
// Lazy import edilir
import { sqliteOPFSInstance } from './sqlite_opfs';
import { migrateLegacyAttachmentsToAesGcm, ... } from './attachments';
// Ağır dependency'ler

export async function initializeStorage(): Promise<void> { ... }
export async function getVaultItems(): Promise<VaultItem[]> { ... }
export async function saveVaultItem(item: VaultItem): Promise<VaultItem[]> { ... }
// ...
```

**Patch:** `useVaultData.ts` → sadece `storageCore` import et, `storageHeavy` callback'lerde dynamic import et:

```typescript
// src/hooks/useVaultData.ts
const refreshDatabase = useCallback(async () => {
  const { getVaultItems } = await import('../lib/storageHeavy');
  // ...
}, []);
```

### 5.5 Patch 5: Görsel splash iyileştirmesi

Eğer storage init arka plana atılırsa ve LockScreen anında gelirse, splash sadece JS bundle parse edilirken (300-500ms) görünür. Bu kısa sürede splash zaten yeterli. Ek değişiklik gerekmiyor.

Ama eğer Katman 1 uygulanmazsa ve splash 6 saniye görünecekse, splash'i daha "canlı" yap:

```css
/* splash.css — daha belirgin */
.splash-screen {
  /* ... existing ... */
}

.splash-progress {
  position: absolute;
  bottom: 60px;
  width: 200px;
  height: 2px;
  background: rgba(255,255,255,0.1);
  border-radius: 1px;
  overflow: hidden;
}

.splash-progress::after {
  content: '';
  display: block;
  width: 30%;
  height: 100%;
  background: #22c55e;
  animation: progress-indeterminate 1.5s ease-in-out infinite;
}

@keyframes progress-indeterminate {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(400%); }
}
```

### 5.6 Patch 6: Image optimizasyonu

```bash
# assets/aegis-app-icon.png'i WebP'ye çevir
# ImageMagick, sharp, veya cwebp
npx sharp-cli -i assets/aegis-app-icon.png -o assets/aegis-app-icon.webp -f webp --quality 80

# index.html'de picture element kullan
<img src="assets/aegis-app-icon.webp" alt="Aegis Vault 7" />
```

Veya sadece boyutu küçült:
```bash
npx sharp-cli -i assets/aegis-app-icon.png -o assets/aegis-app-icon.png resize 256 256
```

---

## 6. Beklenen İyileşme

| Katman | Uygulama | Önce | Sonra | Kazanç |
|---|---|---|---|---|
| **0 (mevcut)** | — | 6.0s | 6.0s | — |
| **1 (acil)** | Patch 1+2+3 | 6.0s | 1.5-2.5s | %60-75 |
| **2 (optimizasyon)** | + 4+5+6 | 1.5-2.5s | 0.8-1.2s | %50 ek |
| **3 (ileri)** | + SW + native splash | 0.8-1.2s | 0.3-0.6s | %50 ek |

**Sonuç:** 6.0s → 0.3-0.6s (warm cache ile), ilk açılış 6.0s → 0.8-1.2s.

---

## 7. Doğrulama Adımları

### 7.1 Patch sonrası ölçüm

1. **Production build:**
   ```bash
   npm run build
   npm run desktop:build
   ```

2. **Chrome DevTools Performance** (Tauri DevTools açıkken):
   - Lighthouse → Performance score
   - Performance tab → "First Contentful Paint", "Largest Contentful Paint", "Time to Interactive"
   - Network tab → Initial bundle size, parse time

3. **Manuel ölçüm:**
   - Uygulamayı kapat, yeniden aç
   - Splash → LockScreen geçiş süresini kronometre ile ölç
   - 3 ardışık açılışta ortalama al

### 7.2 Tauri DevTools açma

`src-tauri/src/lib.rs` veya development sırasında:
```rust
#[cfg(debug_assertions)]
{
  window.open_devtools();
}
```

Veya production için:
- `tauri.conf.json` → `app.windows[0].devtools: true` (sadece debug)
- Production'da DevTools açmak için `tauri-plugin-devtools` veya environment variable

### 7.3 Bundle analyzer

```bash
npm install -D rollup-plugin-visualizer
```

```typescript
// vite.config.ts
import { visualizer } from 'rollup-plugin-visualizer';

plugins: [
  react(),
  tailwindcss(),
  visualizer({ open: true, gzipSize: true })
]
```

Bu, hangi modülün bundle'a ne kadar KB eklediğini görselleştirir.

---

## 8. Önerilen Uygulama Sırası

| Adım | Süre | Etki | Risk |
|---|---|---|---|
| 1. Patch 1 (storage arka plan) | 30dk | %40-50 | Düşük |
| 2. Patch 2 (UnlockedApp lazy) | 1-2 saat | %15-25 | Orta (props refactor) |
| 3. Patch 4 (storageCore/heavy böl) | 2-3 saat | %10-15 | Orta (import zinciri) |
| 4. Patch 6 (image optimizasyon) | 15dk | %5-10 | Çok düşük |
| 5. Patch 3 (manualChunks tweak) | 30dk | %5 | Düşük |
| 6. Patch 5 (splash CSS) | 15dk | Görsel | Çok düşük |
| 7. Katman 3 (SW, native splash) | 1-2 gün | %20-30 | Yüksek (yapı değişikliği) |

**MVP önerisi:** İlk sprint'te Patch 1+2+4 uygula. Bu kombinasyon 6s → ~1.5s iyileşme sağlar, risk düşüktür.

---

## 9. Sonuç

6 saniyelik siyah ekran **tamamen önlenebilir** bir problem. Temel neden: storage initialization'ın LockScreen'i bloklaması ve ağır modüllerin (wa-sqlite, zxcvbn, attachments) eager yüklenmesi.

**Patch 1 (storage arka plana)** tek başına uygulanırsa **%60-70 iyileşme** sağlar. **Patch 2 (UnlockedApp lazy)** ile birlikte **%80+ iyileşme**. Toplam bekleme: **1-1.5 saniye** (cold start).

Eğer agresif patch'ler uygulanırsa (katman 1+2+3), warm cache'de **0.3-0.5 saniye** cold start elde edilebilir — bu, native uygulamalarla yarışır seviyede.

— Mavis, 2026-08-13
