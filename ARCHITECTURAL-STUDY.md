# Kajian Arsitektur: Evolusi Interoperabilitas Polyglot di Aurelia 2
## Dari Manual Glue-Code Dokumentasi Resmi ke Universal Convention Bridge

> **Arsitek & Penulis:** Sandikodev ([@sandikodev](https://github.com/sandikodev))  
> **Status Dokumen:** Living Architectural Blueprint & Guiding Principle  
> **Scope:** `@aureliajs/bridge`, `@aureliajs/islands`, `@hono/aurelia`, `@aureliajs/ssr`  
> **Tujuan:** Menjadi pegangan konsisten, terpadu, dan menyeluruh agar visi rekayasa tidak lagi goyah (*anti-labil*) di masa depan.

---

## 1. Latar Belakang & Pernyataan Masalah

Dalam ekosistem enterprise modern, tim pengembang jarang sekali membangun aplikasi dengan menulis ulang (*rewrite*) 100% pustaka UI dari nol. Skenario yang paling sering terjadi adalah **Polyglot Embedding**:
- Menggunakan widget grafik/dashboard React 19 yang sudah matang.
- Memanfaatkan Design System berbasis Vue 3.5 SFC.
- Mengintegrasikan kontrol interaktif berperforma tinggi dengan Svelte 5 Runes.
- Mengadopsi partial hypermedia dengan HTMX 2.

Aurelia 2 sejak perancangannya memiliki DNA yang sangat fleksibel dan agnostik terhadap DOM. Namun, terdapat kesenjangan (*gap*) yang sangat lebar antara **rekomendasi dokumentasi resmi Aurelia** dengan **kebutuhan Developer Experience (DX) enterprise modern**.

Dokumen ini merekam komparasi mendalam antara 3 titik pijak:
1. **Dokumentasi Resmi Aurelia (docs.aurelia.io)**
2. **Implementasi Ergonomis di `belajar/packages/aurelia-islands` & `belajar/aureliajs`**
3. **Implementasi Fullstack SSR di `packages/aurelia-bridge` & `examples/fullstack-ssr`**

---

## 2. Bedah Kritis Dokumentasi Resmi Aurelia (docs.aurelia.io)

### A. Pola *Manual Wrapper Component* (React, Vue, Svelte)
Di dalam dokumentasi resmi (*"React inside Aurelia"*, *"Vue inside Aurelia"*, *"Svelte inside Aurelia"*), pola integrasi yang diajarkan adalah **manual glue code**:

```typescript
// Rekomendasi docs.aurelia.io: Developer harus membuat wrapper per-komponen/per-framework
@customElement({ name: 'react-wrapper', template: '<div ref="container"></div>' })
export class ReactWrapper {
  @bindable public reactComponent?: ComponentType<any>;
  @bindable public props?: Record<string, unknown>;
  private container!: HTMLDivElement;
  private root: Root | null = null;

  public attached(): void {
    if (this.container && this.reactComponent) {
      this.root = createRoot(this.container);
      this.renderReactComponent();
    }
  }

  public propertyChanged(): void {
    if (this.root) this.renderReactComponent();
  }

  public detaching(): void {
    if (this.root) {
      this.root.unmount();
      this.root = null;
    }
  }

  private renderReactComponent(): void {
    if (this.root && this.reactComponent) {
      this.root.render(createElement(this.reactComponent, this.props ?? {}));
    }
  }
}
```

Hal serupa terjadi pada Vue (membuat `vue-wrapper.ts` dengan `createApp`, `markRaw`, `shallowReactive`) dan Svelte (membuat `svelte-wrapper.ts` dengan `mount()`, `propsState`, `flushSync()`, `unmount()`).

#### Kelemahan Pola Dokumentasi Resmi:
1. **High Boilerplate & Low Ergonomics:** Jika sebuah proyek memiliki 10 widget dari framework berbeda, tim harus menyalin, merawat, dan menguji belasan file wrapper boilerplate yang redundan.
2. **Kerapuhan Lifecycle:** Developer rawan lupa menangani *edge cases* seperti race conditions saat dynamic import, memory leak akibat listener yang tidak ter-unmount, atau detaching di tengah proses rendering asinkron.
3. **Mencederai Filosofi Aurelia:** Kekuatan utama Aurelia adalah *Convention over Configuration*. Memaksa developer menulis wrapper imperatif mencederai keanggunan deklaratif Aurelia.

### B. Paradoks *Synthetic View*
Dokumentasi resmi Aurelia memaparkan konsep **Synthetic View**:
```typescript
const factory = new ViewFactory(this.diContainer, CustomElementDefinition.create({ name: 'dynamic', template }));
this.view = factory.create(this.$controller).setLocation(renderLocation);
await this.view.activate(this.view, this.$controller, Scope.create(viewModel));
```
*Synthetic View* adalah fitur internal Aurelia 2 yang sangat kuat untuk dynamic synthesis tanpa re-render pohon DOM. Namun, jika developer aplikasi disuruh mengetik `convertToRenderLocation()`, `ViewFactory`, dan `Scope.create()` secara manual di aplikasi bisnis mereka, kodenya menjadi kotor, rumit, dan rentan salah.

> **Kesimpulan Kajian Dok Resmi:** Dokumentasi resmi memberikan **fondasi primitif (low-level building blocks)**, tetapi belum menyediakan **abstraksi tingkat tinggi (high-level ergonomic abstraction)** yang siap pakai bagi developer.

---

## 3. Studi Kasus 1: Keberhasilan DX di `belajar/aureliajs`

Di dalam repositori percontohan `/home/dev/bukudigital/belajar/packages/aurelia-islands` dan konsumsinya di `/home/dev/bukudigital/belajar/aureliajs`, Sandikodev membuktikan bahwa seluruh isi dokumentasi resmi di atas dapat diabstraksikan menjadi **Satu Custom Element Universal**: `<aurelia-island>`.

### Keunggulan Arsitektur:
1. **Satu Elemen untuk Semua Framework:**
   ```html
   <!-- Di src/my-app.html -->
   <aurelia-island 
     type="react" 
     component.bind="ReactCounter" 
     value.bind="sharedCounter" 
     on-change.bind="handleCounterUpdate">
   </aurelia-island>

   <aurelia-island 
     type="vue" 
     component.bind="VueCounter" 
     value.bind="sharedCounter" 
     on-change.bind="handleCounterUpdate">
   </aurelia-island>

   <aurelia-island 
     type="svelte" 
     component.bind="SvelteCounter" 
     value.bind="sharedCounter" 
     on-change.bind="handleCounterUpdate">
   </aurelia-island>
   ```

2. **ViewModel yang Murni & Bebas Boilerplate:**
   ```typescript
   // Di src/my-app.ts
   export class MyApp {
     public ReactCounter = ReactCounter;
     public VueCounter = VueCounter;
     public SvelteCounter = SvelteCounter;
     public sharedCounter = 42;

     handleCounterUpdate = (val: number): void => {
       this.sharedCounter = val;
     };
   }
   ```

3. **Mengapa Pola Ini Sangat Bersih & Dicintai Developer?**
   - **Zero Glue Code:** Developer tidak perlu menulis wrapper component lagi.
   - **Direct Reactive Shorthand:** Mendukung `value.bind` dan `on-change.bind` dua arah yang terasa alami bagi pengguna Aurelia.
   - **Convention Compliance:** Berada 100% di dalam file template `.html` terpisah dan ViewModel `.ts` bersih.

---

## 4. Studi Kasus 2: Otopsi & Evaluasi Kritis `examples/fullstack-ssr`

Saat arsitektur dipindahkan ke monorepo utama `/home/dev/project/aureliajs`:
- `@aureliajs/islands` dispesialisasikan untuk **Zero-JS HTML-First SSR & Hydration Triggers** (Astro-style).
- `@aureliajs/bridge` diciptakan untuk **Polyglot Runtime & Hypermedia Bridge** (`<au-bridge>` & `au-htmx`).

Meskipun fondasi teknisnya sangat canggih (race-safe `mountEpoch`, DI container scoping, zero-wrapper HTMX), **DX di `examples/fullstack-ssr` terasa kurang memuaskan dan terasa "berat"**. Mengapa?

### Evaluasi Jujur Penyebab Turunnya DX di `fullstack-ssr`:

1. **Pergeseran dari "Ergonomic App" ke "Heavy Technical Benchmark":**
   Di `fullstack-ssr/src/routes/showcase.ts`, route `/bridge` ditulis dengan string template mentah di server Hono:
   ```typescript
   // MASALAH: Melanggar prinsip Aurelia! Menggunakan raw string template di server
   app.get('/bridge', (c) => {
     return c.html(`<!DOCTYPE html>
       <html>
         ...
         <div id="bridge-app-root"></div>
         <script id="bridge-manifest-data" type="application/json">${JSON.stringify(manifest)}</script>
         <script type="module" src="/bridge/app.js"></script>
       </html>`);
   });
   ```
   Developer tidak lagi merasakan menulis aplikasi Aurelia, melainkan merakit string HTML manual dengan injeksi script tag JSON.

2. **Over-Engineering untuk Keperluan Telemetri & Diffing:**
   Komponen `bridge-app.ts` dibebani oleh pembacaan byte gzip, syntax highlighter Prism, logging event DOM visual, dan navigasi tab filter. Ini adalah fitur bagus untuk *Showcase Demonstration*, tetapi mencederai kesederhanaan DX dasar yang dicari oleh developer aplikasi.

3. **Hilangnya Ergonomi Shorthand (`value.bind`):**
   Di `<au-bridge>`, pengguna diharuskan menulis:
   ```html
   <au-bridge
     using="react"
     component.bind="loadReact"
     props.bind="sharedProps"
     on-event.bind="onReactEvent">
   </au-bridge>
   ```
   Harus membungkus komponen ke fungsi loader (`loadReact = () => import(...)`) dan harus membungkus nilai ke objek `sharedProps` membuat kode terasa lebih panjang dan berjarak dibandingkan `value.bind="sharedCounter"` di `belajar/aureliajs`.

---

## 5. Blueprint Arsitektur Menyeluruh (*Anti-Labil Guiding Principles*)

Agar visi arsitektur `@aureliajs/bridge` memiliki **pegangan yang kokoh, konsisten, dan tidak labil lagi di masa depan**, ditetapkan 4 Prinsip Arsitektur Fundamental:

```
┌────────────────────────────────────────────────────────────────────────┐
│                   AURELIA DEVELOPER EXPERIENCE (DX)                    │
│                                                                        │
│   <!-- Mode 1: Ergonomic Direct Binding (Seindah belajar/aureliajs) -->│
│   <au-bridge using="react" component.bind="ReactCounter"              │
│              value.bind="count" on-change.bind="sync">                 │
│   </au-bridge>                                                         │
│                                                                        │
│   <!-- Mode 2: Enterprise Lazy Props (Untuk heavy code-split) -->      │
│   <au-bridge using="vue" loader.bind="loadAnalytics"                   │
│              props.bind="{ id, data }" island="visible">               │
│   </au-bridge>                                                         │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      FRAMEWORK ADAPTER LAYER                           │
│  (Mengotomatiskan rekomendasi resmi docs.aurelia.io tanpa boilerplate) │
│                                                                        │
│  • React Adapter  -> ReactDOM.createRoot + ErrorBoundary + React 19    │
│  • Vue Adapter    -> createApp + shallowReactive + markRaw             │
│  • Svelte Adapter -> Svelte 5 mount() + $state proxy                   │
│  • Solid Adapter  -> render() + Fine-grained signal proxy              │
│  • HTMX Bridge    -> Zero-wrapper au-htmx custom attribute             │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│               HYDRATION & SSR CORE (@aureliajs/islands)                │
│                                                                        │
│  • Pure Aurelia Pages (.aux atau .html + .ts) via @hono/aurelia        │
│  • Zero Raw HTML String di Route Handler                               │
│  • Synthetic View sebagai Engine Kompilasi Internal                    │
└────────────────────────────────────────────────────────────────────────┘
```

### Prinsip 1: Zero Raw HTML String di Server Route
Server route di Hono **TIDAK BOLEH** me-render string HTML mentah untuk halaman bridge. Seluruh halaman showcase atau bisnis harus berupa komponen Aurelia murni:
```typescript
// BENAR & KONSISTEN:
app.get('/bridge', aurelia(BridgePage));
```
`BridgePage` adalah file `.aux` atau pasangan `bridge-page.ts` + `bridge-page.html`. Server-side rendering ditangani transparan oleh `@hono/aurelia` dan `@aureliajs/ssr`.

### Prinsip 2: Dukungan Dual-Binding pada `<au-bridge>`
`<au-bridge>` harus mendukung dua gaya binding secara *first-class*:
1. **Direct Component Shorthand (Mode Belajar):**
   ```html
   <au-bridge 
     using="react" 
     component.bind="ReactCounter" 
     value.bind="sharedCounter" 
     on-change.bind="handleCounterUpdate">
   </au-bridge>
   ```
2. **Enterprise Lazy Props (Mode Code-Splitting):**
   ```html
   <au-bridge 
     using="react" 
     loader.bind="loadHeavyChart" 
     props.bind="{ theme: 'dark', series: data }" 
     on-event.bind="handleEvent">
   </au-bridge>
   ```

### Prinsip 3: Pemosisian Sejati *Synthetic View*
*Synthetic View* (`ViewFactory` + `Scope`) dari dokumentasi resmi Aurelia **bukanlah konsumsi end-user**, melainkan **senjata internal adapter & engine**.
- Adapter `@aureliajs/bridge` dan runtime `@aureliajs/islands` dapat menggunakan Synthetic View untuk mengisolasi binding context dan scope reaktif tanpa memicu full DOM re-attachment.
- Pengguna akhir tetap menikmati sintaks deklaratif Aurelia yang bersih.

### Prinsip 4: Ortogonalitas yang Ketat
- **`@aureliajs/bridge` bertugas menjawab "WHAT":**
  Framework apa yang dimuat, bagaimana state disinkronkan dua arah, bagaimana event dipancarkan, dan bagaimana instance dibersihkan secara race-safe.
- **`@aureliajs/islands` bertugas menjawab "WHEN & HOW":**
  Kapan JavaScript diunduh dan dihidrasi (Zero-JS baseline, `island="visible"`, `island="idle"`).
- Keduanya menyatu secara elegan cukup dengan menambahkan atribut `island="..."` pada `<au-bridge>`.

---

## 6. Action Items & Roadmap Penyempurnaan

1. **Update API `@aureliajs/bridge` (`src/au-bridge.ts`):**
   - Tambahkan bindable `value` dan `onChange` langsung pada class `AuBridge`.
   - Izinkan `component` menerima objek/kelas komponen langsung (`ComponentType`), di samping fungsi loader asinkron.
2. **Refactor `examples/fullstack-ssr`:**
   - Ubah route `/bridge` dari `c.html(...)` menjadi komponen Aurelia murni `aurelia(BridgeShowcasePage)`.
   - Pisahkan tampilan demo aplikasi dari panel telemetri/benchmark agar kode aplikasi utamanya tetap terlihat bersih, elegan, dan mudah dipelajari oleh developer baru.
3. **Dokumentasikan Panduan Migrasi Resmi:**
   - Jadikan dokumen ini sebagai referensi resmi bagi siapapun yang ingin bermigrasi dari glue code manual docs.aurelia.io ke `@aureliajs/bridge`.

---

> *"Arsitektur terbaik bukanlah yang menambahkan kerumitan paling banyak, melainkan yang menyembunyikan kerumitan terbesar di balik antarmuka yang paling sederhana dan manusiawi."*  
> — Sandikodev
