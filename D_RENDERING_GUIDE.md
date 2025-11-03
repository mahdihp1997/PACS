# راهنمای پیاده‌سازی 3D Volume Rendering و Cine Mode

## 📹 Cine Mode (پخش خودکار تصاویر)

Cine Mode قبلاً در `AdvancedStudyViewer` پیاده‌سازی شده است. این حالت به صورت خودکار تصاویر یک stack رو پخش می‌کنه.

### نحوه کار:
1. با کلیک روی دکمه "Cine" یا فشار دادن کلید `C` فعال می‌شه
2. یک interval timer شروع می‌شه که هر `1000 / cineSpeed` میلی‌ثانیه یک تصویر بعدی رو نمایش می‌ده
3. وقتی به آخر stack می‌رسه، خودکار متوقف می‌شه

### اضافه کردن Cine Mode به MultiViewLayout:

```javascript
// در MultiViewLayout.js اضافه کنید:

const [cineMode, setCineMode] = useState(false);
const [cineSpeed] = useState(5); // frames per second
const cineIntervalRef = useRef(null);

const toggleCineMode = useCallback(() => {
  if (cineMode) {
    // Stop cine
    if (cineIntervalRef.current) {
      clearInterval(cineIntervalRef.current);
      cineIntervalRef.current = null;
    }
    setCineMode(false);
  } else {
    // Start cine
    const viewport = viewports[activeViewport];
    if (viewport && viewport.instances && viewport.instances.length > 1) {
      setCineMode(true);
      const interval = setInterval(() => {
        setViewports(prev => {
          const current = prev[activeViewport];
          if (!current || !current.instances) return prev;
          
          let nextIndex = current.currentIndex + 1;
          if (nextIndex >= current.instances.length) {
            nextIndex = 0; // Loop back to start
          }
          
          // Load next image
          handleImageScroll(activeViewport, 1);
          
          return prev;
        });
      }, 1000 / cineSpeed);
      cineIntervalRef.current = interval;
    }
  }
}, [cineMode, activeViewport, viewports, cineSpeed]);

// Cleanup on unmount
useEffect(() => {
  return () => {
    if (cineIntervalRef.current) {
      clearInterval(cineIntervalRef.current);
    }
  };
}, []);
```

---

## 🎯 3D Volume Rendering (رندر سه‌بعدی)

برای 3D Volume Rendering نیاز به کتابخانه‌های اضافی داریم:

### گزینه 1: استفاده از `cornerstone-threejs` (پیشنهادی)

#### مرحله 1: نصب کتابخانه‌ها

```bash
npm install three @cornerstonejs/core @cornerstonejs/tools @cornerstonejs/streaming-image-volume-loader
```

یا اگر فقط می‌خواید 3D rendering:

```bash
npm install three
```

#### مرحله 2: ساخت یک کامپوننت 3D Viewer

```javascript
// src/components/VolumeRenderer3D.js

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

function VolumeRenderer3D({ imageStack, onClose }) {
  const containerRef = useRef(null);
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const [volumeData, setVolumeData] = useState(null);

  useEffect(() => {
    if (!containerRef.current || !imageStack || imageStack.length === 0) return;

    // Initialize Three.js scene
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      75,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.1,
      1000
    );
    camera.position.z = 5;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    containerRef.current.appendChild(renderer.domElement);

    sceneRef.current = scene;
    rendererRef.current = renderer;
    cameraRef.current = camera;

    // Load volume data from image stack
    loadVolumeData(imageStack).then(data => {
      setVolumeData(data);
      // Create 3D volume visualization
      createVolumeVisualization(scene, data);
      animate();
    });

    const handleResize = () => {
      camera.aspect = containerRef.current.clientWidth / containerRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (rendererRef.current) {
        rendererRef.current.dispose();
        containerRef.current?.removeChild(rendererRef.current.domElement);
      }
    };
  }, [imageStack]);

  const loadVolumeData = async (stack) => {
    // این قسمت نیاز به بارگذاری pixel data از تصاویر DICOM داره
    // باید از cornerstone برای load کردن استفاده کنید
    // و بعد pixel data رو به یک 3D texture تبدیل کنید
    
    // مثال ساده:
    const volumeSize = {
      width: stack[0]?.columns || 256,
      height: stack[0]?.rows || 256,
      depth: stack.length
    };
    
    // اینجا باید pixel data رو از تصاویر استخراج کنید
    // و در یک TypedArray قرار بدید
    
    return {
      size: volumeSize,
      data: null // باید pixel data رو پر کنید
    };
  };

  const createVolumeVisualization = (scene, volumeData) => {
    // روش 1: Ray Casting (Volume Rendering)
    // روش 2: Multi-planar Reconstruction (MPR)
    // روش 3: Isosurface Extraction
    
    // مثال: یک cube ساده برای نمایش
    const geometry = new THREE.BoxGeometry(
      volumeData.size.width / 100,
      volumeData.size.height / 100,
      volumeData.size.depth / 100
    );
    const material = new THREE.MeshBasicMaterial({ 
      color: 0x00ff00,
      wireframe: true 
    });
    const cube = new THREE.Mesh(geometry, material);
    scene.add(cube);
  };

  const animate = () => {
    requestAnimationFrame(() => {
      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
        animate();
      }
    });
  };

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <button
        onClick={onClose}
        style={{
          position: 'absolute',
          top: '10px',
          right: '10px',
          zIndex: 100,
          padding: '10px',
          background: '#4a5568',
          color: 'white',
          border: 'none',
          borderRadius: '5px',
          cursor: 'pointer'
        }}
      >
        Close 3D
      </button>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}

export default VolumeRenderer3D;
```

### گزینه 2: استفاده از `vtk.js` (قدرتمندتر ولی پیچیده‌تر)

```bash
npm install @kitware/vtk.js
```

vtk.js برای 3D volume rendering خیلی بهتره ولی پیاده‌سازی پیچیده‌تری داره.

---

## 🔄 MPR (Multi-Planar Reconstruction)

MPR یعنی نمایش سه view مختلف از یک volume:
- **Axial**: نگاه از بالا به پایین
- **Sagittal**: نگاه از کنار (چپ-راست)
- **Coronal**: نگاه از جلو (جلو-عقب)

### پیاده‌سازی ساده MPR:

```javascript
// src/utils/mprUtils.js

export const getMPRViews = (volumeData, viewType) => {
  const { width, height, depth, data } = volumeData;
  
  let sliceData;
  
  switch (viewType) {
    case 'axial':
      // Axial: XY plane (Z constant)
      sliceData = data.slice(0, width * height); // First slice
      return { width, height, data: sliceData };
      
    case 'sagittal':
      // Sagittal: YZ plane (X constant)
      // نیاز به interpolation داره
      return { width: depth, height, data: null };
      
    case 'coronal':
      // Coronal: XZ plane (Y constant)
      // نیاز به interpolation داره
      return { width, height: depth, data: null };
      
    default:
      return null;
  }
};
```

---

## 📝 مراحل پیاده‌سازی کامل:

### 1. Cine Mode در MultiViewLayout:
   - دکمه Cine به toolbar اضافه کنید
   - از کد بالا استفاده کنید

### 2. 3D Volume Rendering:
   - نصب `three`
   - ساخت کامپوننت `VolumeRenderer3D`
   - بارگذاری pixel data از DICOM images
   - استفاده از Volume Rendering technique (Ray Casting)

### 3. MPR:
   - ساخت سه viewport برای Axial/Sagittal/Coronal
   - Extract کردن slice ها از volume data
   - نمایش در viewport های مختلف

---

## ⚠️ نکات مهم:

1. **Performance**: 3D rendering سنگینه، بهتره از Web Workers استفاده کنید
2. **Memory**: Volume data می‌تونه خیلی بزرگ باشه (مثلاً 512x512x200 = ~50MB)
3. **Codecs**: برای DICOM های فشرده (JPEG2000) نیاز به codec های مناسب دارید
4. **GPU**: برای Volume Rendering بهتره از WebGL2 استفاده کنید

---

## 🚀 پیشنهاد:

برای شروع، پیشنهاد می‌کنم:
1. اول Cine Mode رو به MultiViewLayout اضافه کنید (ساده‌تر)
2. بعد MPR رو پیاده کنید (میانی)
3. در آخر 3D Volume Rendering (پیچیده‌تر)

## ✅ پیاده‌سازی انجام شده:

### 1. Cine Mode ✅
- در `AdvancedStudyViewer`: ✅ اضافه شده
- در `MultiViewLayout`: ✅ اضافه شده
- کلید میانبر: `C`

### 2. 3D Volume Rendering ✅
- کامپوننت `VolumeRenderer3D.js`: ✅ ساخته شده
- پشتیبانی از Three.js: ✅ اضافه شده به `package.json`
- سه حالت rendering:
  - **MIP (Maximum Intensity Projection)**: ✅
  - **Average Intensity**: ✅
  - **Ray Casting (Point Cloud)**: ✅
- کنترل‌های تعاملی:
  - Drag برای rotate: ✅
  - Scroll برای zoom: ✅
  - تنظیم Opacity: ✅
  - تنظیم Threshold: ✅

### 3. MPR (Multi-Planar Reconstruction) ✅
- کامپوننت `MPRViewer.js`: ✅ ساخته شده
- سه view:
  - **Axial (XY Plane)**: ✅
  - **Sagittal (YZ Plane)**: ✅
  - **Coronal (XZ Plane)**: ✅
- Navigation برای هر view: ✅
- استفاده از Cornerstone برای نمایش: ✅

### 4. یکپارچه‌سازی با AdvancedStudyViewer ✅
- دکمه "3D View" در toolbar: ✅
- دکمه "MPR" در toolbar: ✅
- Modal نمایش 3D و MPR: ✅

---

## 📦 نصب:

```bash
npm install three
```

---

## 🎯 نحوه استفاده:

### در AdvancedStudyViewer:
1. یک series با حداقل 2 تصویر انتخاب کنید
2. روی دکمه "🎯 3D View" کلیک کنید برای 3D Volume Rendering
3. روی دکمه "📐 MPR" کلیک کنید برای Multi-Planar Reconstruction

### در MultiViewLayout:
- Cine Mode: دکمه "▶️ Cine" یا کلید `C`

---

## 🔧 بهبودهای آینده:

1. **Ray Casting واقعی**: استفاده از WebGL shaders برای volume rendering واقعی
2. **Interpolation بهتر**: برای MPR views
3. **Performance**: استفاده از Web Workers برای پردازش حجمی
4. **Export 3D**: ذخیره rendering به صورت تصویر یا video

