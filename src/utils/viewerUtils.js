import * as cornerstone from 'cornerstone-core';

// Window/Level Presets
export const WINDOW_PRESETS = {
  Brain: { windowCenter: 40, windowWidth: 80 },
  Lung: { windowCenter: -600, windowWidth: 1500 },
  Bone: { windowCenter: 300, windowWidth: 1500 },
  SoftTissue: { windowCenter: 40, windowWidth: 400 },
  Abdomen: { windowCenter: 50, windowWidth: 350 },
  Chest: { windowCenter: 50, windowWidth: 350 },
  Liver: { windowCenter: 50, windowWidth: 150 },
  Default: null // Use image defaults
};

export const applyWindowPreset = (element, presetName) => {
  if (!element) return;
    
  try {
    const viewport = cornerstone.getViewport(element);
    const preset = WINDOW_PRESETS[presetName];
    
    if (preset && preset.windowCenter && preset.windowWidth) {
      viewport.voi = {
        windowCenter: preset.windowCenter,
        windowWidth: preset.windowWidth
      };
    } else {
      // Reset to image defaults
      const image = cornerstone.getImage(element);
      if (image) {
        viewport.voi = {
          windowCenter: image.windowCenter || 127,
          windowWidth: image.windowWidth || 256
        };
      }
    }
    
    cornerstone.setViewport(element, viewport);
    cornerstone.updateImage(element);
  } catch (err) {
    console.error('Error applying window preset:', err);
  }
};

// Export image to PNG/JPEG
export const exportImage = async (element, format = 'png', quality = 0.95) => {
  if (!element) return;
  
  try {
    const canvas = element.querySelector('canvas');
    if (!canvas) {
      console.error('Canvas not found');
      return;
    }
    
    const mimeType = format === 'jpeg' || format === 'jpg' 
      ? 'image/jpeg' 
      : 'image/png';
    
    const dataUrl = canvas.toDataURL(mimeType, quality);
    const link = document.createElement('a');
    link.download = `dicom-export-${Date.now()}.${format}`;
    link.href = dataUrl;
    link.click();
  } catch (err) {
    console.error('Error exporting image:', err);
    throw err;
  }
};

// Calculate histogram from image
export const calculateHistogram = (image) => {
  if (!image) return null;
  
  try {
    // Try to get pixel data from cornerstone image
    let pixelData;
    if (image.getPixelData) {
      pixelData = image.getPixelData();
    } else if (image.pixelData) {
      pixelData = image.pixelData;
    } else {
      console.warn('Cannot get pixel data from image');
      return null;
    }
    
    if (!pixelData || pixelData.length === 0) return null;
    
    const histogram = new Array(256).fill(0);
    const min = image.minPixelValue !== undefined ? image.minPixelValue : Math.min(...Array.from(pixelData.slice(0, Math.min(10000, pixelData.length))));
    const max = image.maxPixelValue !== undefined ? image.maxPixelValue : Math.max(...Array.from(pixelData.slice(0, Math.min(10000, pixelData.length))));
    const range = max - min || 1;
    
    // Sample pixels for performance (use every nth pixel for large images)
    const step = pixelData.length > 1000000 ? Math.floor(pixelData.length / 1000000) : 1;
    let sampledCount = 0;
    
    for (let i = 0; i < pixelData.length; i += step) {
      const value = pixelData[i];
      const normalized = Math.floor(((value - min) / range) * 255);
      const bin = Math.max(0, Math.min(255, normalized));
      histogram[bin]++;
      sampledCount++;
    }
    
    return {
      bins: histogram,
      min,
      max,
      total: sampledCount
    };
  } catch (err) {
    console.error('Error calculating histogram:', err);
    return null;
  }
};

// Apply image filters (canvas-based)
export const applyImageFilter = (element, filterType) => {
  if (!element) return;
  
  try {
    const canvas = element.querySelector('canvas');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    switch (filterType) {
      case 'sharpen':
        // Simple sharpen kernel
        applyConvolution(data, canvas.width, canvas.height, [
          0, -1, 0,
          -1, 5, -1,
          0, -1, 0
        ]);
        break;
        
      case 'smooth':
        // Simple blur kernel
        applyConvolution(data, canvas.width, canvas.height, [
          1, 1, 1,
          1, 1, 1,
          1, 1, 1
        ], 1/9);
        break;
        
      case 'edge':
        // Edge detection kernel
        applyConvolution(data, canvas.width, canvas.height, [
          -1, -1, -1,
          -1, 8, -1,
          -1, -1, -1
        ]);
        break;
        
      default:
        return;
    }
    
    ctx.putImageData(imageData, 0, 0);
  } catch (err) {
    console.error('Error applying filter:', err);
  }
};

const applyConvolution = (data, width, height, kernel, divisor = 1) => {
  const temp = new Uint8ClampedArray(data);
  const kSize = Math.sqrt(kernel.length);
  const offset = Math.floor(kSize / 2);
  
  for (let y = offset; y < height - offset; y++) {
    for (let x = offset; x < width - offset; x++) {
      let r = 0, g = 0, b = 0;
      
      for (let ky = 0; ky < kSize; ky++) {
        for (let kx = 0; kx < kSize; kx++) {
          const px = ((y + ky - offset) * width + (x + kx - offset)) * 4;
          const k = kernel[ky * kSize + kx];
          r += temp[px] * k;
          g += temp[px + 1] * k;
          b += temp[px + 2] * k;
        }
      }
      
      const idx = (y * width + x) * 4;
      data[idx] = Math.max(0, Math.min(255, r * divisor));
      data[idx + 1] = Math.max(0, Math.min(255, g * divisor));
      data[idx + 2] = Math.max(0, Math.min(255, b * divisor));
    }
  }
};

// Get DICOM tags from image metadata (if available)
export const getDicomTags = (image) => {
  if (!image) return null;
  
  // Extract available metadata from cornerstone image object
  const tags = {
    'Rows': image.rows,
    'Columns': image.columns,
    'Bits Allocated': image.sizeInBytes ? image.sizeInBytes * 8 / (image.rows * image.columns) : 'N/A',
    'Bits Stored': image.bitsPerPixel || 'N/A',
    'Samples Per Pixel': image.slope !== undefined ? 1 : 'N/A',
    'Photometric Interpretation': image.photometricInterpretation || 'N/A',
    'Window Center': image.windowCenter || 'N/A',
    'Window Width': image.windowWidth || 'N/A',
    'Rescale Intercept': image.intercept || 'N/A',
    'Rescale Slope': image.slope || 'N/A',
    'Pixel Spacing': image.rowPixelSpacing && image.columnPixelSpacing 
      ? `${image.rowPixelSpacing}, ${image.columnPixelSpacing}`
      : 'N/A',
  };
  
  return tags;
};


