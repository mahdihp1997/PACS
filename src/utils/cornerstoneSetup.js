import * as cornerstone from 'cornerstone-core';
import * as cornerstoneTools from 'cornerstone-tools';
import * as cornerstoneMath from 'cornerstone-math';
import * as cornerstoneWADOImageLoader from 'cornerstone-wado-image-loader';
import * as dicomParser from 'dicom-parser';
import Hammer from 'hammerjs';

let initialized = false;

export const initializeCornerstone = () => {
  if (initialized) {
    console.log('Cornerstone already initialized');
    return;
  }

  console.log('🔧 Initializing Cornerstone...');

  try {
    // Set external dependencies
    cornerstoneWADOImageLoader.external.cornerstone = cornerstone;
    cornerstoneWADOImageLoader.external.dicomParser = dicomParser;
    cornerstoneTools.external.cornerstone = cornerstone;
    cornerstoneTools.external.cornerstoneMath = cornerstoneMath;
    cornerstoneTools.external.Hammer = Hammer;

    // Configure Web Workers and codecs (expects files to exist in public/cornerstone)
    // این بخش برای decode کردن تصاویر فشرده DICOM (JPEG 2000, JPEG-LS) ضروری است
    const workerPath = '/cornerstone/cornerstoneWADOImageLoaderWebWorker.js';
    const codecsPath = '/cornerstone/codecs/';
    
    // بررسی دقیق وجود فایل worker
    fetch(workerPath, { method: 'HEAD', cache: 'no-cache' })
      .then(response => {
        if (response.ok) {
          console.log('✅ Worker file found:', workerPath);
          
          // Initialize web worker manager
          try {
            cornerstoneWADOImageLoader.webWorkerManager.initialize({
              webWorkerPath: workerPath,
              maxWebWorkers: navigator.hardwareConcurrency || 4,
              startWebWorkersOnDemand: true,
              taskConfiguration: {
                decodeTask: {
                  initializeCodecsOnStartup: true,
                  strict: false,
                  usePDFJS: false,
                  codecsPath: codecsPath,
                  useWebWorkers: true
                }
              }
            });
            console.log('✅ Web Worker Manager initialized successfully');
            
            // بررسی فایل‌های codec (بعد از initialize شدن worker)
            setTimeout(() => {
              const codecFiles = [
                'openjpeg-wasm.js',
                'openjpeg-wasm.wasm',
                'jpeg-wasm.js',
                'jpeg-wasm.wasm',
                'charls-wasm.js',
                'charls-wasm.wasm'
              ];
              
              let foundCount = 0;
              codecFiles.forEach(file => {
                fetch(`${codecsPath}${file}`, { method: 'HEAD', cache: 'no-cache' })
                  .then(res => {
                    if (res.ok) {
                      foundCount++;
                      console.log(`✅ Codec found: ${file}`);
                    }
                  })
                  .catch(() => {
                    // Try alternative names
                    const altFile = file.replace('-wasm', '');
                    fetch(`${codecsPath}${altFile}`, { method: 'HEAD', cache: 'no-cache' })
                      .then(altRes => {
                        if (altRes.ok) {
                          foundCount++;
                          console.log(`✅ Codec found (alt): ${altFile}`);
                        }
                      })
                      .catch(() => {
                        console.warn(`⚠️ Codec not found: ${file}`);
                      });
                  });
              });
              
              // بعد از بررسی همه فایل‌ها
              setTimeout(() => {
                if (foundCount === 0) {
                  console.error('❌ هیچ فایل codec پیدا نشد!');
                  console.error('❌ تصاویر فشرده DICOM به صورت برفکی نمایش داده می‌شوند');
                  console.error('📝 راه حل:');
                  console.error('   1. در terminal اجرا کنید: node scripts/setup-cornerstone-codecs.js');
                  console.error('   2. یا دستی فایل‌ها را از node_modules به public/cornerstone/ کپی کنید');
                  console.error('   3. سرور را restart کنید');
                } else if (foundCount < 3) {
                  console.warn(`⚠️ فقط ${foundCount} از ${codecFiles.length} فایل codec پیدا شد`);
                  console.warn('⚠️ ممکن است برخی تصاویر فشرده به درستی decode نشوند');
                } else {
                  console.log(`✅ ${foundCount} فایل codec پیدا شد - آماده برای decode`);
                }
              }, 1000);
            }, 300);
          } catch (initError) {
            console.error('❌ خطا در initialize کردن Web Worker Manager:', initError);
            console.error('⚠️ تصاویر فشرده ممکن است به صورت برفکی نمایش داده شوند');
          }
        } else {
          console.error('❌ Worker file not found! Status:', response.status);
          console.error('❌ تصاویر فشرده DICOM به صورت برفکی نمایش داده می‌شوند');
          console.error('📝 راه حل:');
          console.error('   1. در terminal اجرا کنید: node scripts/setup-cornerstone-codecs.js');
          console.error('   2. بررسی کنید فایل در public/cornerstone/ موجود باشد');
          console.error('   3. سرور را restart کنید');
          
          // Fallback: try without web workers (limited support)
          console.warn('⚠️ استفاده از حالت fallback (بدون web workers)');
          cornerstoneWADOImageLoader.configure({
            useWebWorkers: false,
            strict: false
          });
        }
      })
      .catch(err => {
        console.error('❌ خطا در بررسی worker file:', err);
        console.error('❌ تصاویر فشرده DICOM به صورت برفکی نمایش داده می‌شوند');
        console.error('📝 راه حل:');
        console.error('   1. در terminal اجرا کنید: node scripts/setup-cornerstone-codecs.js');
        console.error('   2. بررسی کنید فایل در public/cornerstone/ موجود باشد');
        console.error('   3. سرور را restart کنید');
      });

    // Configure loader and decode options
    // این تنظیمات برای decode کردن صحیح تصاویر DICOM ضروری است
    cornerstoneWADOImageLoader.configure({
      beforeSend: function(xhr) {
        // Optional: Add auth headers if needed
      },
      useWebWorkers: true, // برای decode تصاویر فشرده ضروری است
      strict: false, // اجازه decode تصاویر با transfer syntax های مختلف
      decodeConfig: {
        convertFloatPixelDataToInt: false,
        use16BitDataType: true,
        usePDFJS: false
      },
      // Error handler برای debug بهتر
      errorHandler: function(error, element) {
        console.error('❌ DICOM decode error:', error);
        
        if (error && error.message) {
          if (error.message.includes('codec') || error.message.includes('codecs')) {
            console.error('⚠️ مشکل در load شدن codec!');
            console.error('📝 راه حل: node scripts/setup-cornerstone-codecs.js را اجرا کنید');
          } else if (error.message.includes('readSequenceItem') || error.message.includes('item tag')) {
            console.error('⚠️ فایل DICOM خراب یا ناقص است!');
            console.error('⚠️ ممکن است فایل به درستی از سرور load نشده باشد');
            console.error('📝 راه حل:');
            console.error('   1. بررسی کنید فایل در سرور موجود باشد');
            console.error('   2. بررسی کنید فایل کامل download شده باشد');
            console.error('   3. این فایل خاص را skip کنید و ادامه دهید');
          } else if (error.exception) {
            console.error('⚠️ Exception در parsing DICOM:', error.exception);
            if (error.exception.includes('readSequenceItem')) {
              console.error('⚠️ فایل DICOM دارای مشکل در structure است');
              console.error('⚠️ احتمالاً فایل خراب است یا به درستی encode نشده');
            }
          }
        }
        
        if (error && error.dataSet) {
          console.error('⚠️ DataSet در error موجود است - فایل DICOM partial parse شده');
        }
      }
    });

    // Register image loaders
    // This ensures wadouri: prefix works
    // IMPORTANT: Always register before any image loading
    if (typeof cornerstone.registerImageLoader === 'function') {
      cornerstone.registerImageLoader('wadouri', cornerstoneWADOImageLoader.wadouri.loadImage);
      console.log('✅ wadouri image loader registered');
    } else {
      console.warn('⚠️ cornerstone.registerImageLoader is not available');
    }

    // Also ensure wadouri loader is available via alternative method
    if (cornerstoneWADOImageLoader.wadouri && cornerstoneWADOImageLoader.wadouri.loadImage) {
      // Force registration if not already registered
      try {
        cornerstone.registerImageLoader('wadouri', cornerstoneWADOImageLoader.wadouri.loadImage);
      } catch (e) {
        // Might already be registered, which is fine
        console.log('Image loader registration:', e.message || 'Already registered');
      }
    }

    // Initialize cornerstone tools
    cornerstoneTools.init({
      mouseEnabled: true,
      touchEnabled: true,
      globalToolSyncEnabled: false,
      showSVGCursors: false
    });

    // Add tools
    cornerstoneTools.addTool(cornerstoneTools.WwwcTool);
    cornerstoneTools.addTool(cornerstoneTools.PanTool);
    cornerstoneTools.addTool(cornerstoneTools.ZoomTool);
    cornerstoneTools.addTool(cornerstoneTools.LengthTool);
    cornerstoneTools.addTool(cornerstoneTools.AngleTool);
    cornerstoneTools.addTool(cornerstoneTools.EllipticalRoiTool);
    cornerstoneTools.addTool(cornerstoneTools.StackScrollMouseWheelTool);

    initialized = true;
    console.log('✅ Cornerstone initialized successfully with codec support');
  } catch (error) {
    console.error('❌ Error initializing Cornerstone:', error);
  }
};

export const enableTools = (element) => {
  try {
    // CRITICAL: Ensure image loader is registered before enabling tools
    // StackScrollMouseWheelTool needs the loader to be available
    if (typeof cornerstone.registerImageLoader === 'function') {
      try {
        cornerstone.registerImageLoader('wadouri', cornerstoneWADOImageLoader.wadouri.loadImage);
        console.log('✅ wadouri loader registered in enableTools');
      } catch (e) {
        // Might already be registered
        console.log('Loader registration in enableTools:', e.message || 'OK');
      }
    }

    // Use an element-specific tool state manager to avoid persisting
    // annotations across sessions/elements
    const elementToolStateManager = cornerstoneTools.newImageIdSpecificToolStateManager();
    cornerstoneTools.setElementToolStateManager(element, elementToolStateManager);

    // Ensure stack state exists to satisfy tools that expect it on render
    try {
      cornerstoneTools.addStackStateManager(element, ['stack']);
      cornerstoneTools.addToolState(element, 'stack', {
        imageIds: [],
        currentImageIdIndex: 0
      });
    } catch (_) {}

    // Enable stack scroll with mouse wheel
    cornerstoneTools.addToolForElement(element, cornerstoneTools.StackScrollMouseWheelTool);
    cornerstoneTools.setToolActiveForElement(element, 'StackScrollMouseWheel', {});

    // Register interactive tools for this element so interactions work
    cornerstoneTools.addToolForElement(element, cornerstoneTools.WwwcTool);
    cornerstoneTools.addToolForElement(element, cornerstoneTools.PanTool);
    cornerstoneTools.addToolForElement(element, cornerstoneTools.ZoomTool);
    cornerstoneTools.addToolForElement(element, cornerstoneTools.LengthTool);
    cornerstoneTools.addToolForElement(element, cornerstoneTools.AngleTool);
    cornerstoneTools.addToolForElement(element, cornerstoneTools.EllipticalRoiTool);

    console.log('✅ Tools enabled for element');
  } catch (error) {
    console.error('Error enabling tools:', error);
  }
};

export const setActiveTool = (element, toolName) => {
  try {
    // Deactivate all tools first
    const tools = ['Wwwc', 'Pan', 'Zoom', 'Length', 'Angle', 'EllipticalRoi'];
    tools.forEach(tool => {
      try {
        cornerstoneTools.setToolPassiveForElement(element, tool, {});
      } catch (e) {
        // Tool might not be added yet
      }
    });

    // Activate the selected tool
    if (toolName === 'Zoom') {
      cornerstoneTools.setToolActiveForElement(element, 'Zoom', { mouseButtonMask: 1 });
    } else if (toolName === 'Pan') {
      cornerstoneTools.setToolActiveForElement(element, 'Pan', { mouseButtonMask: 1 });
    } else if (toolName === 'Wwwc') {
      cornerstoneTools.setToolActiveForElement(element, 'Wwwc', { mouseButtonMask: 1 });
    } else if (toolName === 'Length') {
      cornerstoneTools.setToolActiveForElement(element, 'Length', { mouseButtonMask: 1 });
    } else if (toolName === 'Angle') {
      cornerstoneTools.setToolActiveForElement(element, 'Angle', { mouseButtonMask: 1 });
    } else if (toolName === 'EllipticalRoi') {
      cornerstoneTools.setToolActiveForElement(element, 'EllipticalRoi', { mouseButtonMask: 1 });
    }

    console.log(`Tool activated: ${toolName}`);
  } catch (error) {
    console.error('Error setting active tool:', error);
  }
};

export const clearTools = (element) => {
  try {
    // Set interactive tools to passive to stop any active manipulations
    const interactiveTools = ['Length', 'Angle', 'EllipticalRoi'];
    interactiveTools.forEach(tool => {
      try { cornerstoneTools.setToolPassiveForElement(element, tool, {}); } catch (_) {}
    });

    // Preserve current stack state
    const existingStack = (() => {
      try {
        return cornerstoneTools.getToolState(element, 'stack')?.data?.[0] || null;
      } catch (_) {
        return null;
      }
    })();

    // Clear annotation state for common measurement tools only
    const toClear = [
      'Length', 'length',
      'Angle', 'angle',
      'EllipticalRoi', 'ellipticalRoi'
    ];
    toClear.forEach(key => {
      try { cornerstoneTools.clearToolState(element, key); } catch (_) {}
    });

    // Ensure stack tool state remains valid after clearing
    if (existingStack) {
      try {
        // Reset stack to its previous imageIds and index
        cornerstoneTools.clearToolState(element, 'stack');
        cornerstoneTools.addToolState(element, 'stack', {
          imageIds: existingStack.imageIds || [],
          currentImageIdIndex: existingStack.currentImageIdIndex || 0
        });
      } catch (_) {}
    }

    cornerstone.updateImage(element);
    console.log('Tools cleared');
  } catch (error) {
    console.error('Error clearing tools:', error);
  }
};

export const invertImage = (element) => {
  try {
    const viewport = cornerstone.getViewport(element);
    viewport.invert = !viewport.invert;
    cornerstone.setViewport(element, viewport);
  } catch (error) {
    console.error('Error inverting image:', error);
  }
};

export const rotateImage = (element, angle) => {
  try {
    const viewport = cornerstone.getViewport(element);
    viewport.rotation = (viewport.rotation || 0) + angle;
    cornerstone.setViewport(element, viewport);
  } catch (error) {
    console.error('Error rotating image:', error);
  }
};

export const flipImage = (element, horizontal) => {
  try {
    const viewport = cornerstone.getViewport(element);
    if (horizontal) {
      viewport.hflip = !viewport.hflip;
    } else {
      viewport.vflip = !viewport.vflip;
    }
    cornerstone.setViewport(element, viewport);
  } catch (error) {
    console.error('Error flipping image:', error);
  }
};

const cornerstoneSetup = {
  initializeCornerstone,
  enableTools,
  setActiveTool,
  clearTools,
  invertImage,
  rotateImage,
  flipImage
};

export default cornerstoneSetup;

