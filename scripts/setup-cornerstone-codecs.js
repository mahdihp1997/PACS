/**
 * Script برای کپی کردن فایل‌های Cornerstone Codec به public folder
 * 
 * اجرا: node scripts/setup-cornerstone-codecs.js
 */

const fs = require('fs');
const path = require('path');

const sourceDirs = [
  'node_modules/cornerstone-wado-image-loader/dist',
  'node_modules/@cornerstonejs/codec-openjpeg/dist',
  'node_modules/@cornerstonejs/codec-libjpeg-turbo-8bit/dist',
];

const targetDir = 'public/cornerstone';
const codecsDir = path.join(targetDir, 'codecs');

// Create directories
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}
if (!fs.existsSync(codecsDir)) {
  fs.mkdirSync(codecsDir, { recursive: true });
}

console.log('🔧 Setting up Cornerstone codecs...');

// Copy worker file
const workerFiles = [
  'cornerstoneWADOImageLoaderWebWorker.js',
  'cornerstoneWADOImageLoaderWebWorker.min.js'
];

let workerCopied = false;
for (const sourceDir of sourceDirs) {
  if (!fs.existsSync(sourceDir)) continue;
  
  for (const workerFile of workerFiles) {
    const sourcePath = path.join(sourceDir, workerFile);
    if (fs.existsSync(sourcePath)) {
      const targetPath = path.join(targetDir, workerFile.replace('.min.js', '.js'));
      fs.copyFileSync(sourcePath, targetPath);
      console.log(`✅ Copied: ${workerFile} -> ${targetPath}`);
      workerCopied = true;
      break;
    }
  }
  if (workerCopied) break;
}

if (!workerCopied) {
  console.warn('⚠️  Worker file not found. You may need to install cornerstone-wado-image-loader');
}

// Copy codec files - look for all .js and .wasm files in codec directories
let codecCopied = false;
const codecPatterns = ['charls', 'openjpeg', 'jpeg', 'wasm'];

for (const sourceDir of sourceDirs) {
  if (!fs.existsSync(sourceDir)) {
    console.log(`⚠️  Directory not found: ${sourceDir}`);
    continue;
  }
  
  console.log(`\n🔍 Scanning: ${sourceDir}`);
  const files = fs.readdirSync(sourceDir);
  let foundAny = false;
  
  for (const file of files) {
    // Check if file matches codec patterns or is a wasm file
    const isCodecFile = codecPatterns.some(pattern => 
      file.toLowerCase().includes(pattern.toLowerCase())
    ) || file.endsWith('.wasm');
    
    if (isCodecFile && (file.endsWith('.js') || file.endsWith('.wasm'))) {
      const sourcePath = path.join(sourceDir, file);
      const targetPath = path.join(codecsDir, file);
      
      try {
        // Only copy if target doesn't exist or source is newer
        if (!fs.existsSync(targetPath)) {
          fs.copyFileSync(sourcePath, targetPath);
          console.log(`  ✅ Copied: ${file}`);
          codecCopied = true;
          foundAny = true;
        } else {
          const sourceStat = fs.statSync(sourcePath);
          const targetStat = fs.statSync(targetPath);
          if (sourceStat.mtime > targetStat.mtime) {
            fs.copyFileSync(sourcePath, targetPath);
            console.log(`  🔄 Updated: ${file}`);
            codecCopied = true;
            foundAny = true;
          } else {
            console.log(`  ⏭️  Skipped (up to date): ${file}`);
          }
        }
      } catch (err) {
        console.error(`  ❌ Error copying ${file}:`, err.message);
      }
    }
  }
  
  if (!foundAny) {
    console.log(`  ⚠️  No codec files found in ${sourceDir}`);
  }
}

if (!codecCopied) {
  console.warn('⚠️  Codec files not found. You may need to install @cornerstonejs/codec-* packages');
}

// Create a simple fallback if files don't exist
if (!workerCopied) {
  console.log('\n📝 Creating placeholder worker file...');
  const placeholder = `// Cornerstone WADO Image Loader Web Worker
// This is a placeholder. Please copy the actual file from node_modules
console.warn('Cornerstone worker file not found. Please run: npm run setup-codecs');`;
  fs.writeFileSync(
    path.join(targetDir, 'cornerstoneWADOImageLoaderWebWorker.js'),
    placeholder
  );
}

console.log('\n📋 Summary:');
console.log(`   Target directory: ${targetDir}`);
console.log(`   Codecs directory: ${codecsDir}`);

// List copied files
if (fs.existsSync(targetDir)) {
  const targetFiles = fs.readdirSync(targetDir);
  console.log(`\n   Files in ${targetDir}:`);
  targetFiles.forEach(file => {
    const filePath = path.join(targetDir, file);
    const stats = fs.statSync(filePath);
    console.log(`     - ${file} (${(stats.size / 1024).toFixed(2)} KB)`);
  });
}

if (fs.existsSync(codecsDir)) {
  const codecFiles = fs.readdirSync(codecsDir);
  if (codecFiles.length > 0) {
    console.log(`\n   Files in ${codecsDir}:`);
    codecFiles.forEach(file => {
      const filePath = path.join(codecsDir, file);
      const stats = fs.statSync(filePath);
      console.log(`     - ${file} (${(stats.size / 1024).toFixed(2)} KB)`);
    });
  } else {
    console.log(`\n   ⚠️  No codec files in ${codecsDir}`);
  }
}

if (!workerCopied || !codecCopied) {
  console.log('\n⚠️  WARNING: Some files may be missing!');
  console.log('   این می‌تواند باعث نمایش برفکی تصاویر DICOM شود.');
  console.log('\n   بررسی کنید packages نصب شده باشند:');
  console.log('     npm list cornerstone-wado-image-loader');
  console.log('     npm list @cornerstonejs/codec-openjpeg');
  console.log('     npm list @cornerstonejs/codec-libjpeg-turbo-8bit');
  console.log('\n   اگر نصب نیستند، اجرا کنید:');
  console.log('     npm install');
  console.log('\n   سپس دوباره این اسکریپت را اجرا کنید.');
} else {
  console.log('\n✅ Setup کامل شد!');
  console.log('\n📋 مراحل بعدی:');
  console.log('   1. سرور را restart کنید (npm start)');
  console.log('   2. Browser Console را باز کنید (F12)');
  console.log('   3. پیام‌های زیر را بررسی کنید:');
  console.log('      ✅ Worker file found');
  console.log('      ✅ Codec found: ...');
  console.log('      ✅ Web Worker Manager initialized');
  console.log('\n   اگر پیام‌های خطا دیدید:');
  console.log('      ❌ Worker file not found');
  console.log('      ❌ Codec not found');
  console.log('   یعنی فایل‌ها کپی نشده‌اند یا در مسیر اشتباه هستند.');
  console.log('\n   یک تصویر DICOM فشرده را تست کنید.');
  console.log('   اگر هنوز برفکی است، Console را بررسی کنید.');
}


