# راهنمای رفع مشکل تصاویر برفکی (Snowy Images)

## مشکل:
تصاویر DICOM فشرده (JPEG2000, JPEG-LS) به صورت برفکی (noisy/snowy) نمایش داده می‌شن.

## علت:
فایل‌های **Web Worker** و **Codec** برای decode کردن تصاویر فشرده در پوشه `public/cornerstone` وجود ندارن.

---

## راه حل:

### مرحله 1: نصب dependency های لازم

```bash
npm install
```

### مرحله 2: کپی کردن فایل‌های Codec

دو روش دارید:

#### روش A: استفاده از script خودکار (پیشنهادی)

```bash
npm run setup-codecs
```

این script به صورت خودکار فایل‌های لازم رو از `node_modules` به `public/cornerstone` کپی می‌کنه.

#### روش B: کپی دستی

```bash
# ایجاد پوشه‌ها
mkdir -p public/cornerstone/codecs

# کپی worker file
cp node_modules/cornerstone-wado-image-loader/dist/cornerstoneWADOImageLoaderWebWorker.js public/cornerstone/

# کپی codec files (اگر موجود باشن)
cp node_modules/@cornerstonejs/codec-openjpeg/dist/*.js public/cornerstone/codecs/ 2>/dev/null || true
cp node_modules/@cornerstonejs/codec-openjpeg/dist/*.wasm public/cornerstone/codecs/ 2>/dev/null || true
```

### مرحله 3: بررسی ساختار فایل‌ها

بعد از کپی، باید این ساختار رو داشته باشید:

```
public/
  cornerstone/
    cornerstoneWADOImageLoaderWebWorker.js  ← باید وجود داشته باشه
    codecs/
      openjpeg.js                           ← برای JPEG2000
      openjpeg-wasm.js
      openjpeg-wasm.wasm
      charls.js                             ← برای JPEG-LS (اختیاری)
      ...
```

### مرحله 4: Restart سرور

```bash
# Stop سرور (Ctrl+C)
# دوباره start کنید:
npm start
```

---

## بررسی اینکه کدک‌ها لود شدن:

بعد از restart، در **Console مرورگر** (F12) باید این پیام‌ها رو ببینید:

```
✅ Cornerstone initialized successfully with codec support
✅ Web Worker Manager initialized
```

و **نباید** این خطاها رو ببینید:
```
⚠️ Web Worker initialization failed
Failed to load codec: openjpeg
```

---

## اگر فایل‌ها پیدا نشدن:

### مشکل 1: فایل worker پیدا نمی‌شه

راه حل: بررسی کنید که `cornerstone-wado-image-loader` نصب شده:

```bash
npm list cornerstone-wado-image-loader
```

اگر نصب نیست:
```bash
npm install cornerstone-wado-image-loader
```

### مشکل 2: Codec files پیدا نمی‌شن

راه حل: نصب پکیج‌های codec:

```bash
npm install @cornerstonejs/codec-openjpeg
npm install @cornerstonejs/codec-libjpeg-turbo-8bit
```

بعد دوباره `npm run setup-codecs` رو اجرا کنید.

---

## روش جایگزین: استفاده از CDN

اگر فایل‌ها در `node_modules` نیستن، می‌تونید از CDN استفاده کنید:

1. دانلود `cornerstoneWADOImageLoaderWebWorker.js` از:
   - https://unpkg.com/cornerstone-wado-image-loader@latest/dist/cornerstoneWADOImageLoaderWebWorker.js
   
2. ذخیره در `public/cornerstone/cornerstoneWADOImageLoaderWebWorker.js`

3. دانلود codec files از پکیج‌های مربوطه

---

## تست:

بعد از setup، یک DICOM فشرده (JPEG2000) رو باز کنید. باید تصویر واضح و بدون noise نمایش داده بشه.

---

## نکات:

1. **برای production**: فایل‌ها باید در `public/` باشن تا از مرورگر قابل دسترسی باشن
2. **CORS**: مطمئن بشید که سرور backend CORS headers رو درست set کرده
3. **Cache**: اگر تغییرات اعمال نشد، cache مرورگر رو پاک کنید (Ctrl+Shift+R)

---

## پشتیبانی:

اگر بعد از این مراحل هنوز مشکل دارید:
1. Console مرورگر رو بررسی کنید (F12)
2. Network tab رو چک کنید - آیا فایل‌های `.wasm` و `.js` load شدن؟
3. بررسی کنید که path ها در `cornerstoneSetup.js` درست هستن


