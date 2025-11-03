import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { pacsAPI } from '../services/api';
import * as cornerstone from 'cornerstone-core';
import * as cornerstoneTools from 'cornerstone-tools';
import * as cornerstoneWADOImageLoader from 'cornerstone-wado-image-loader';
import {
  initializeCornerstone,
  enableTools,
  setActiveTool,
  clearTools,
  invertImage,
  rotateImage,
  flipImage
} from '../utils/cornerstoneSetup';
import {
  WINDOW_PRESETS,
  applyWindowPreset,
  exportImage,
  calculateHistogram,
  getDicomTags
} from '../utils/viewerUtils';
import VolumeRenderer3D from './VolumeRenderer3D';
import MPRViewer from './MPRViewer';
import './AdvancedStudyViewer.css';

function AdvancedStudyViewer() {
  const { studyUid } = useParams();
  const navigate = useNavigate();
  
  const [study, setStudy] = useState(null);
  const [series, setSeries] = useState([]);
  const [selectedSeries, setSelectedSeries] = useState(null);
  const [instances, setInstances] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [activeTool, setActiveToolState] = useState('Wwwc');
  const [imageInfo, setImageInfo] = useState(null);
  const [isElementEnabled, setIsElementEnabled] = useState(false);
  
  // Advanced features state
  const [cineMode, setCineMode] = useState(false);
  const [cineSpeed] = useState(5); // frames per second
  const [windowPreset, setWindowPreset] = useState('Default');
  const [showHistogram, setShowHistogram] = useState(false);
  const [histogramData, setHistogramData] = useState(null);
  const [showDicomTags, setShowDicomTags] = useState(false);
  const [dicomTags, setDicomTags] = useState(null);
  const [currentImage, setCurrentImage] = useState(null);
  const [show3DViewer, setShow3DViewer] = useState(false);
  const [showMPRViewer, setShowMPRViewer] = useState(false);
  
  const viewerRef = useRef(null);
  const elementRef = useRef(null);
  const stackRef = useRef({ imageIds: [], currentImageIdIndex: 0 });
  const cineIntervalRef = useRef(null);

  // Helper to ensure image loader is registered before loading
  const ensureImageLoader = useCallback(() => {
    if (cornerstoneWADOImageLoader && cornerstoneWADOImageLoader.wadouri) {
      try {
        if (typeof cornerstone.registerImageLoader === 'function') {
          cornerstone.registerImageLoader('wadouri', cornerstoneWADOImageLoader.wadouri.loadImage);
          return true;
        }
      } catch (e) {
        console.warn('Could not register loader:', e);
      }
    }
    return false;
  }, []);

  // Helper to log detailed error information
  const logDetailedError = useCallback((error, context = '') => {
    console.error(`❌ Error ${context}:`, error);
    console.error('   Error type:', error?.constructor?.name);
    console.error('   Error message:', error?.message || error?.toString());
    
    if (error?.response) {
      console.error('   HTTP Status:', error.response.status, error.response.statusText);
      console.error('   Response data:', error.response.data);
      if (error.response.headers) {
        console.error('   Response headers:', error.response.headers);
      }
    }
    
    if (error?.request) {
      console.error('   Request URL:', error.request?.responseURL || error.config?.url);
      console.error('   Request method:', error.config?.method);
    }
    
    if (error?.stack) {
      console.error('   Stack trace:', error.stack);
    }
    
    if (error?.error) {
      console.error('   Nested error:', error.error);
    }
    
    // Log full error object for deep inspection (handle circular references)
    try {
      const seen = new WeakSet();
      const errorStr = JSON.stringify(error, (key, value) => {
        // Handle circular references and functions
        if (typeof value === 'function') {
          return '[Function]';
        }
        if (typeof value === 'object' && value !== null) {
          if (seen.has(value)) {
            return '[Circular]';
          }
          seen.add(value);
        }
        return value;
      }, 2);
      console.error('   Full error object:', errorStr);
    } catch (stringifyError) {
      console.error('   Could not stringify error:', stringifyError.message);
      console.error('   Error keys:', Object.keys(error || {}));
      console.error('   Error prototype:', Object.getPrototypeOf(error));
    }
  }, []);

  const loadStudyData = useCallback(async () => {
    try {
      setLoading(true);
      const [studyRes, seriesRes] = await Promise.all([
        pacsAPI.getStudy(studyUid),
        pacsAPI.getStudySeries(studyUid)
      ]);
      setStudy(studyRes.data);
      setSeries(seriesRes.data);
      if (seriesRes.data.length > 0) {
        handleSeriesSelect(seriesRes.data[0].series_instance_uid);
      }
      setError(null);
    } catch (err) {
      setError('Failed to load study: ' + err.message);
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  }, [studyUid]);

  // Initialize Cornerstone once and ensure loader is registered
  useEffect(() => {
    initializeCornerstone();
    
    // Force register wadouri loader to ensure it's always available
    if (cornerstoneWADOImageLoader && cornerstoneWADOImageLoader.wadouri) {
      try {
        if (typeof cornerstone.registerImageLoader === 'function') {
          cornerstone.registerImageLoader('wadouri', cornerstoneWADOImageLoader.wadouri.loadImage);
          console.log('✅ wadouri loader re-registered in component');
        }
      } catch (e) {
        console.warn('Could not register wadouri loader:', e);
      }
    }
    
    loadStudyData();
    
    return () => {
      if (elementRef.current) {
        try {
          // Clear annotations and stack state before disabling
          clearTools(elementRef.current);
          cornerstone.disable(elementRef.current);
        } catch (e) {
          console.error('Error disabling cornerstone:', e);
        }
      }
    };
  }, [studyUid, loadStudyData]);

  // Enable element when viewerRef is ready (poll once until available)
  useEffect(() => {
    if (isElementEnabled) return;
    const id = setInterval(() => {
    if (viewerRef.current && !isElementEnabled) {
      try {
          // Ensure loader is registered before enabling element
          ensureImageLoader();
          
        cornerstone.enable(viewerRef.current);
        elementRef.current = viewerRef.current;
        enableTools(viewerRef.current);
        setActiveTool(viewerRef.current, 'Wwwc');
        setIsElementEnabled(true);
        console.log('Cornerstone element enabled');
          clearInterval(id);
      } catch (e) {
        console.error('Error enabling cornerstone element:', e);
      }
    }
    }, 100);
    return () => clearInterval(id);
  }, [isElementEnabled, ensureImageLoader]);

  // Listen for stack scroll events to sync stack state
  useEffect(() => {
    if (!elementRef.current) return;

    const handleStackScroll = (evt) => {
      try {
        const stackState = cornerstoneTools.getToolState(elementRef.current, 'stack');
        if (stackState && stackState.data && stackState.data.length > 0) {
          const stackData = stackState.data[0];
          const newIndex = stackData.currentImageIdIndex;
          
          // Update our ref and state if index changed
          if (newIndex !== currentIndex && newIndex >= 0 && newIndex < stackRef.current.imageIds.length) {
            console.log('Stack scrolled to index:', newIndex);
            setCurrentIndex(newIndex);
            stackRef.current.currentImageIdIndex = newIndex;
            
            // Load the image if not already loaded
            const imageId = stackRef.current.imageIds[newIndex];
            if (imageId) {
              cornerstone.loadImage(imageId).then(image => {
                cornerstone.displayImage(elementRef.current, image);
                setCurrentImage(image);
                updateImageInfo(image);
              }).catch(err => {
                console.error('Error loading scrolled image:', err);
              });
            }
          }
        }
      } catch (e) {
        console.warn('Error handling stack scroll:', e);
      }
    };

    // Listen to cornerstone events
    elementRef.current.addEventListener('cornerstoneimageloaded', handleStackScroll);
    
    // Also listen to stack scroll tool events if available
    if (elementRef.current.addEventListener) {
      elementRef.current.addEventListener('cornerstoneimageloaded', handleStackScroll);
    }

    return () => {
      if (elementRef.current) {
        elementRef.current.removeEventListener('cornerstoneimageloaded', handleStackScroll);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, isElementEnabled]);

  const loadStack = useCallback(async () => {
    if (!elementRef.current || instances.length === 0) {
      console.warn('Cannot load stack: element or instances not ready');
      return;
    }

    try {
      setImageLoading(true);
      console.log('Loading stack with', instances.length, 'instances');
      const imageIds = instances.map(instance => {
        const fileUrl = pacsAPI.getInstanceFile(instance.sop_instance_uid);
        const imageId = `wadouri:${fileUrl}`;
        // Verify imageId format
        if (!imageId.startsWith('wadouri:')) {
          console.warn('Invalid imageId format:', imageId);
        }
        return imageId;
      });
      
      // Try to validate first image before setting stack
      // This helps catch corrupted files early
      let validImageIds = imageIds;
      let startIndex = 0;
      
      if (imageIds.length > 0) {
        console.log('Validating first image before loading stack...');
        try {
          // Quick validation attempt (just check if it can be accessed)
          // We'll do full load in the main try block
        } catch (validationError) {
          console.warn('First image validation failed, will attempt to skip...');
        }
      }
      
      stackRef.current = {
        imageIds: validImageIds,
        currentImageIdIndex: startIndex
      };
      console.log('Loading first image:', validImageIds[startIndex] || validImageIds[0]);
      console.log('Total imageIds in stack:', validImageIds.length);
      
      // CRITICAL: Ensure image loader is registered BEFORE setting stack state
      // StackScrollMouseWheelTool needs the loader to be available
      ensureImageLoader();
      console.log('✅ wadouri loader registered before stack load');
      
      // Ensure stack state manager is set before first display
      try {
      cornerstoneTools.addStackStateManager(elementRef.current, ['stack']);
      cornerstoneTools.addToolState(elementRef.current, 'stack', stackRef.current);
      } catch (_) {}
      
      // Ensure loader is registered again right before loading (double check)
      ensureImageLoader();
      
      // Load image with better error handling
      let image;
      try {
        console.log('Attempting to load image:', imageIds[0]);
        image = await cornerstone.loadImage(imageIds[0]);
        console.log('✅ Image loaded successfully');
      } catch (loadError) {
        console.error('❌ Error loading image:', loadError);
        console.error('   ImageId:', imageIds[0]);
        logDetailedError(loadError, 'loading first image in stack');
        
        // Check for DICOM parsing errors
        // Error structure can be: { error: { exception: "..." } } or { message: "..." }
        const errorMessage = loadError?.message || 
                            loadError?.error?.exception || 
                            loadError?.exception || 
                            (loadError?.error && typeof loadError.error === 'string' ? loadError.error : '') ||
                            '';
        const isDicomParseError = errorMessage.includes('readSequenceItem') || 
                                  errorMessage.includes('item tag') ||
                                  errorMessage.includes('not found at offset') ||
                                  errorMessage.includes('dicomParser') ||
                                  (loadError?.error?.exception && typeof loadError.error.exception === 'string');
        
        if (isDicomParseError) {
          console.error('⚠️ فایل DICOM خراب یا ناقص است!');
          console.error('⚠️ این فایل قابل نمایش نیست');
          
          // Skip this image and try next one if available
          if (imageIds.length > 1) {
            console.warn('⚠️ Skipping corrupted image, trying next image...');
            setError('فایل DICOM اول خراب بود، در حال تلاش برای فایل بعدی...');
            try {
              image = await cornerstone.loadImage(imageIds[1]);
              console.log('✅ Loaded next image successfully');
              setError(null); // Clear error if next image loaded successfully
              // Update stack to skip corrupted image
              const validImageIds = imageIds.slice(1);
              stackRef.current = {
                imageIds: validImageIds,
                currentImageIdIndex: 0
              };
              setCurrentIndex(0);
              // Update stack state
              try {
                cornerstoneTools.addToolState(elementRef.current, 'stack', {
                  imageIds: validImageIds,
                  currentImageIdIndex: 0
                });
              } catch (_) {}
            } catch (nextError) {
              // Try to find next valid image in loop
              console.warn('⚠️ Next image also corrupted, trying to find valid image...');
              let foundValid = false;
              for (let i = 2; i < imageIds.length; i++) {
                try {
                  image = await cornerstone.loadImage(imageIds[i]);
                  console.log(`✅ Loaded valid image at index ${i} successfully`);
                  setError(null); // Clear error if valid image found
                  // Update stack to skip corrupted images
                  const validImageIds = imageIds.slice(i);
                  stackRef.current = {
                    imageIds: validImageIds,
                    currentImageIdIndex: 0
                  };
                  setCurrentIndex(0);
                  // Update stack state
                  try {
                    cornerstoneTools.addToolState(elementRef.current, 'stack', {
                      imageIds: validImageIds,
                      currentImageIdIndex: 0
                    });
                  } catch (_) {}
                  foundValid = true;
                  break;
                } catch (skipError) {
                  console.warn(`⚠️ Image at index ${i} also corrupted, skipping...`);
                  continue;
                }
              }
              
              if (!foundValid) {
                throw new Error(`همه فایل‌های DICOM در این series خراب هستند یا قابل نمایش نیستند`);
              }
            }
          } else {
            throw new Error(`فایل DICOM خراب است و قابل نمایش نیست: ${errorMessage}`);
          }
        } 
        // Check if it's a loader error
        else if (loadError?.message?.includes('no image loader') || loadError?.message?.includes('loader')) {
          console.error('⚠️ Image loader not found! Re-initializing...');
          initializeCornerstone();
          ensureImageLoader();
          // Retry once
          try {
            image = await cornerstone.loadImage(imageIds[0]);
            console.log('✅ Image loaded after re-initialization');
          } catch (retryError) {
            throw new Error(`Failed to load image after retry: ${retryError?.message || retryError}`);
          }
        } else {
          throw loadError;
        }
      }
      
      cornerstone.displayImage(elementRef.current, image);
      setCurrentImage(image);
      updateImageInfo(image);
      
      // Update stack state after loading image to ensure tools can access it
      try {
        cornerstoneTools.addStackStateManager(elementRef.current, ['stack']);
        cornerstoneTools.addToolState(elementRef.current, 'stack', {
          imageIds: imageIds,
          currentImageIdIndex: 0
        });
      } catch (e) {
        console.warn('Could not update stack state:', e);
      }
      
      // Calculate histogram if needed
      if (showHistogram) {
        const hist = calculateHistogram(image);
        setHistogramData(hist);
      }
      
      // Extract DICOM tags if needed
      if (showDicomTags) {
        const tags = getDicomTags(image);
        setDicomTags(tags);
      }
      // Apply viewport with VOI and MONOCHROME1 handling
      const viewport = cornerstone.getDefaultViewportForImage(elementRef.current, image);
      if (image.photometricInterpretation === 'MONOCHROME1') {
        viewport.invert = true;
      }
      if (image.windowCenter && image.windowWidth) {
        viewport.voi = {
          windowCenter: image.windowCenter,
          windowWidth: image.windowWidth
        };
      } else if (
        typeof image.minPixelValue === 'number' &&
        typeof image.maxPixelValue === 'number'
      ) {
        const ww = image.maxPixelValue - image.minPixelValue;
        const wc = image.minPixelValue + ww / 2;
        viewport.voi = { windowCenter: wc, windowWidth: Math.max(ww, 1) };
      }
      cornerstone.setViewport(elementRef.current, viewport);
      console.log('Stack loaded successfully');
    } catch (err) {
      logDetailedError(err, 'loading stack');
      
      // Show detailed error to user
      const errorMessage = err?.message || err?.toString() || 'Unknown error';
      const statusCode = err?.response?.status || err?.status;
      const statusText = err?.response?.statusText || err?.statusText || '';
      
      let userMessage = `خطا در بارگذاری تصاویر:\n${errorMessage}`;
      if (statusCode) {
        userMessage += `\n\nStatus: ${statusCode} ${statusText}`;
      }
      if (err?.response?.data) {
        console.error('   Response data:', err.response.data);
      }
      
      setError(`خطا در بارگذاری تصاویر: ${errorMessage}`);
      alert(`${userMessage}\n\nبرای جزئیات بیشتر، Console را بررسی کنید (F12)`);
    } finally {
      setImageLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instances]);

  // Load stack when series/instances change
  useEffect(() => {
    if (selectedSeries && instances.length > 0 && isElementEnabled && elementRef.current) {
      loadStack();
    }
  }, [selectedSeries, instances, isElementEnabled, loadStack]);

  

  const handleSeriesSelect = async (seriesUid) => {
    try {
      setImageLoading(true);
      const response = await pacsAPI.getSeriesInstances(seriesUid);
      
      // Sort by instance number
      const sortedInstances = response.data.sort((a, b) => {
        return parseInt(a.instance_number) - parseInt(b.instance_number);
      });
      
      setInstances(sortedInstances);
      setSelectedSeries(seriesUid);
      setCurrentIndex(0);
      
      console.log(`Loaded ${sortedInstances.length} instances for series ${seriesUid}`);
    } catch (err) {
      console.error('Error loading series:', err);
      alert('Failed to load series images');
    } finally {
      setImageLoading(false);
    }
  };

  

  const loadImageByIndex = async (index) => {
    if (!elementRef.current || !stackRef.current.imageIds[index]) {
      console.warn('Cannot load image: invalid index or element');
      return;
    }

    try {
      setImageLoading(true);
      setCurrentIndex(index);
      stackRef.current.currentImageIdIndex = index;
      
      const imageId = stackRef.current.imageIds[index];
      console.log('Loading image at index', index, ':', imageId);
      
      // Ensure image loader is registered before loading
      // StackScrollMouseWheelTool will use this when scrolling
      ensureImageLoader();
      
      // Load image with better error handling
      let image;
      try {
        console.log('Loading image at index', index, 'imageId:', imageId);
        image = await cornerstone.loadImage(imageId);
        console.log('✅ Image loaded at index', index);
      } catch (loadError) {
        console.error('❌ Error loading image at index', index);
        console.error('   ImageId:', imageId);
        logDetailedError(loadError, `loading image at index ${index}`);
        
        // Check for DICOM parsing errors
        // Error structure can be: { error: { exception: "..." } } or { message: "..." }
        const errorMessage = loadError?.message || 
                            loadError?.error?.exception || 
                            loadError?.exception || 
                            (loadError?.error && typeof loadError.error === 'string' ? loadError.error : '') ||
                            '';
        const isDicomParseError = errorMessage.includes('readSequenceItem') || 
                                  errorMessage.includes('item tag') ||
                                  errorMessage.includes('not found at offset') ||
                                  errorMessage.includes('dicomParser') ||
                                  (loadError?.error?.exception && typeof loadError.error.exception === 'string');
        
        if (isDicomParseError) {
          console.error('⚠️ فایل DICOM خراب یا ناقص است!');
          console.error('⚠️ این فایل قابل نمایش نیست');
          
          // Skip this image and try next one if available
          if (index < stackRef.current.imageIds.length - 1) {
            console.warn(`⚠️ Skipping corrupted image at index ${index}, trying next image...`);
            const nextIndex = index + 1;
            const nextImageId = stackRef.current.imageIds[nextIndex];
            try {
              image = await cornerstone.loadImage(nextImageId);
              console.log(`✅ Loaded next image at index ${nextIndex} successfully`);
              setCurrentIndex(nextIndex);
              stackRef.current.currentImageIdIndex = nextIndex;
              // Continue with next image
            } catch (nextError) {
              // If next also fails, show error but don't crash
              setError(`فایل DICOM در index ${index} و ${nextIndex} خراب است`);
              alert(`فایل DICOM خراب است و قابل نمایش نیست.\n\nبرای جزئیات بیشتر، Console را بررسی کنید (F12)`);
              return; // Exit without loading
            }
          } else {
            // No next image, show error
            throw new Error(`فایل DICOM خراب است و قابل نمایش نیست: ${errorMessage}`);
          }
        }
        // Check if it's a loader error
        else if (loadError?.message?.includes('no image loader') || loadError?.message?.includes('loader')) {
          console.error('⚠️ Image loader not found! Re-initializing...');
          initializeCornerstone();
          ensureImageLoader();
          // Retry once
          try {
            image = await cornerstone.loadImage(imageId);
            console.log('✅ Image loaded after re-initialization');
          } catch (retryError) {
            throw new Error(`Failed to load image after retry: ${retryError?.message || retryError}`);
          }
        } else {
          throw loadError;
        }
      }
      
      cornerstone.displayImage(elementRef.current, image);
      
      // Update stack state with current index
      try {
        cornerstoneTools.addToolState(elementRef.current, 'stack', {
          imageIds: stackRef.current.imageIds,
          currentImageIdIndex: index
        });
      } catch (e) {
        console.warn('Could not update stack state:', e);
      }
      
      setCurrentImage(image);
      updateImageInfo(image);
      
      // Calculate histogram if needed
      if (showHistogram) {
        const hist = calculateHistogram(image);
        setHistogramData(hist);
      }
      
      // Extract DICOM tags if needed
      if (showDicomTags) {
        const tags = getDicomTags(image);
        setDicomTags(tags);
      }
      // Apply viewport with VOI and MONOCHROME1 handling for each image
      const viewport = cornerstone.getDefaultViewportForImage(elementRef.current, image);
      if (image.photometricInterpretation === 'MONOCHROME1') {
        viewport.invert = true;
      }
      if (image.windowCenter && image.windowWidth) {
        viewport.voi = {
          windowCenter: image.windowCenter,
          windowWidth: image.windowWidth
        };
      } else if (
        typeof image.minPixelValue === 'number' &&
        typeof image.maxPixelValue === 'number'
      ) {
        const ww = image.maxPixelValue - image.minPixelValue;
        const wc = image.minPixelValue + ww / 2;
        viewport.voi = { windowCenter: wc, windowWidth: Math.max(ww, 1) };
      }
      cornerstone.setViewport(elementRef.current, viewport);
      
      console.log('Image loaded successfully');
    } catch (err) {
      logDetailedError(err, 'loading image by index');
      
      // Show detailed error
      const errorMessage = err?.message || 'Unknown error';
      setError(`خطا در بارگذاری تصویر: ${errorMessage}`);
      alert(`خطا در بارگذاری تصویر:\n${errorMessage}\n\nبرای جزئیات بیشتر، Console را بررسی کنید (F12)`);
    } finally {
      setImageLoading(false);
    }
  };

  const updateImageInfo = (image) => {
    if (!image) return;
    
    const { rows, columns, windowCenter, windowWidth } = image;
    setImageInfo({
      rows,
      columns,
      windowCenter: windowCenter || 'N/A',
      windowWidth: windowWidth || 'N/A'
    });
  };

  const handlePrevImage = () => {
    if (currentIndex > 0) {
      loadImageByIndex(currentIndex - 1);
    }
  };

  const handleNextImage = () => {
    if (currentIndex < instances.length - 1) {
      loadImageByIndex(currentIndex + 1);
    }
  };

  const handleToolSelect = (toolName) => {
    if (!elementRef.current) {
      console.warn('Cannot set tool: element not ready');
      return;
    }
    
    setActiveToolState(toolName);
    setActiveTool(elementRef.current, toolName);
    console.log('Active tool set to:', toolName);
  };

  const handleZoomIn = () => {
    if (!elementRef.current) return;
    
    try {
      const viewport = cornerstone.getViewport(elementRef.current);
      viewport.scale += 0.25;
      cornerstone.setViewport(elementRef.current, viewport);
      console.log('Zoomed in to scale:', viewport.scale);
    } catch (err) {
      console.error('Error zooming in:', err);
    }
  };

  const handleZoomOut = () => {
    if (!elementRef.current) return;
    
    try {
      const viewport = cornerstone.getViewport(elementRef.current);
      viewport.scale = Math.max(0.25, viewport.scale - 0.25);
      cornerstone.setViewport(elementRef.current, viewport);
      console.log('Zoomed out to scale:', viewport.scale);
    } catch (err) {
      console.error('Error zooming out:', err);
    }
  };

  const handleReset = () => {
    if (!elementRef.current) return;
    
    try {
      cornerstone.reset(elementRef.current);
      console.log('Viewport reset');
    } catch (err) {
      console.error('Error resetting viewport:', err);
    }
  };

  const handleInvert = () => {
    if (!elementRef.current) return;
    
    try {
      invertImage(elementRef.current);
      console.log('Image inverted');
    } catch (err) {
      console.error('Error inverting image:', err);
    }
  };

  const handleRotateLeft = () => {
    if (!elementRef.current) return;
    
    try {
      rotateImage(elementRef.current, -90);
      console.log('Rotated left');
    } catch (err) {
      console.error('Error rotating:', err);
    }
  };

  const handleRotateRight = () => {
    if (!elementRef.current) return;
    
    try {
      rotateImage(elementRef.current, 90);
      console.log('Rotated right');
    } catch (err) {
      console.error('Error rotating:', err);
    }
  };

  const handleFlipH = () => {
    if (!elementRef.current) return;
    
    try {
      flipImage(elementRef.current, true);
      console.log('Flipped horizontally');
    } catch (err) {
      console.error('Error flipping:', err);
    }
  };

  const handleFlipV = () => {
    if (!elementRef.current) return;
    
    try {
      flipImage(elementRef.current, false);
      console.log('Flipped vertically');
    } catch (err) {
      console.error('Error flipping:', err);
    }
  };

  const handleClearAnnotations = () => {
    if (!elementRef.current) return;
    
    try {
      // Temporarily switch to a safe tool to avoid in-progress manipulations
      const prevTool = activeTool;
      setActiveTool(elementRef.current, 'Wwwc');
      setActiveToolState('Wwwc');

      // Clear annotations but preserve stack; if missing, restore from stackRef
      clearTools(elementRef.current);
      const hasStack = (() => {
        try {
          return !!cornerstoneTools.getToolState(elementRef.current, 'stack');
        } catch (_) { return false; }
      })();
      if (!hasStack && stackRef.current.imageIds?.length) {
        try {
          cornerstoneTools.addStackStateManager(elementRef.current, ['stack']);
          cornerstoneTools.addToolState(elementRef.current, 'stack', stackRef.current);
        } catch (_) {}
      }
      // Restore previous active tool
      setActiveTool(elementRef.current, prevTool);
      setActiveToolState(prevTool);
      console.log('Annotations cleared');
    } catch (err) {
      console.error('Error clearing annotations:', err);
    }
  };

  const handleDownload = () => {
    if (!instances[currentIndex]) return;
    
    const sopUid = instances[currentIndex].sop_instance_uid;
    const url = pacsAPI.getInstanceFile(sopUid);
    window.open(url, '_blank');
  };

  // Cine mode handler
  const toggleCineMode = () => {
    if (cineMode) {
      // Stop cine
      if (cineIntervalRef.current) {
        clearInterval(cineIntervalRef.current);
        cineIntervalRef.current = null;
      }
      setCineMode(false);
    } else {
      // Start cine
      if (instances.length > 1) {
        setCineMode(true);
        const interval = setInterval(() => {
          setCurrentIndex(prev => {
            if (prev < instances.length - 1) {
              loadImageByIndex(prev + 1);
              return prev + 1;
            } else {
              setCineMode(false);
              clearInterval(cineIntervalRef.current);
              return 0;
            }
          });
        }, 1000 / cineSpeed);
        cineIntervalRef.current = interval;
      }
    }
  };

  // Window preset handler
  const handleWindowPresetChange = (presetName) => {
    setWindowPreset(presetName);
    if (elementRef.current) {
      applyWindowPreset(elementRef.current, presetName);
    }
  };

  // Export handler
  const handleExport = async (format = 'png') => {
    try {
      if (!elementRef.current) return;
      await exportImage(elementRef.current, format);
    } catch (err) {
      console.error('Export failed:', err);
      alert('Failed to export image');
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      
      switch(e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          handlePrevImage();
          break;
        case 'ArrowRight':
          e.preventDefault();
          handleNextImage();
          break;
        case '+':
        case '=':
          e.preventDefault();
          handleZoomIn();
          break;
        case '-':
        case '_':
          e.preventDefault();
          handleZoomOut();
          break;
        case 'r':
        case 'R':
          e.preventDefault();
          handleReset();
          break;
        case 'c':
        case 'C':
          e.preventDefault();
          toggleCineMode();
          break;
        case 'e':
        case 'E':
          e.preventDefault();
          handleExport('png');
          break;
        case 'h':
        case 'H':
          e.preventDefault();
          setShowHistogram(!showHistogram);
          break;
        case 't':
        case 'T':
          e.preventDefault();
          setShowDicomTags(!showDicomTags);
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, instances.length, showHistogram, showDicomTags]);

  // Cleanup cine on unmount
  useEffect(() => {
    return () => {
      if (cineIntervalRef.current) {
        clearInterval(cineIntervalRef.current);
      }
    };
  }, []);

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Loading study...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-container">
        <h2>❌ Error</h2>
        <p>{error}</p>
        <button onClick={() => navigate(-1)}>Go Back</button>
      </div>
    );
  }

  return (
    <div className="advanced-viewer-container">
      {/* Header */}
      <div className="viewer-header">
        <button className="back-button" onClick={() => navigate(-1)}>
          ← Back
        </button>
        <div className="study-info">
          <h2>{study?.study_description || 'Study Viewer'}</h2>
          <p>{study?.study_date} - {study?.study_time}</p>
        </div>
      </div>

      <div className="viewer-layout">
        {/* Series Sidebar */}
        <div className="series-sidebar">
          <h3>Series ({series.length})</h3>
          <div className="series-list">
            {series.map((s) => (
              <div
                key={s.series_instance_uid}
                className={`series-item ${selectedSeries === s.series_instance_uid ? 'active' : ''}`}
                onClick={() => handleSeriesSelect(s.series_instance_uid)}
              >
                <div className="series-icon">📸</div>
                <div className="series-details">
                  <strong>{s.modality}</strong>
                  <p>Series {s.series_number}</p>
                  <small>{s.series_description || 'No description'}</small>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Main Viewer */}
        <div className="viewer-main">
          {/* Toolbar */}
          <div className="viewer-toolbar">
            {/* Navigation */}
            <div className="toolbar-group">
              <button 
                onClick={handlePrevImage} 
                disabled={currentIndex === 0 || imageLoading}
                title="Previous Image"
              >
                ⬅️
              </button>
              <span className="image-counter">
                {currentIndex + 1} / {instances.length}
              </span>
              <button 
                onClick={handleNextImage} 
                disabled={currentIndex === instances.length - 1 || imageLoading}
                title="Next Image"
              >
                ➡️
              </button>
            </div>

            <div className="toolbar-separator"></div>

            {/* Tools */}
            <div className="toolbar-group">
              <button
                className={activeTool === 'Wwwc' ? 'active' : ''}
                onClick={() => handleToolSelect('Wwwc')}
                title="Window/Level"
                disabled={!isElementEnabled}
              >
                🎚️ W/L
              </button>
              <button
                className={activeTool === 'Pan' ? 'active' : ''}
                onClick={() => handleToolSelect('Pan')}
                title="Pan"
                disabled={!isElementEnabled}
              >
                ✋ Pan
              </button>
              <button
                onClick={handleZoomIn}
                title="Zoom In"
                disabled={!isElementEnabled}
              >
                🔍+
              </button>
              <button
                onClick={handleZoomOut}
                title="Zoom Out"
                disabled={!isElementEnabled}
              >
                🔍-
              </button>
            </div>

            <div className="toolbar-separator"></div>

            {/* Measurements */}
            <div className="toolbar-group">
              <button
                className={activeTool === 'Length' ? 'active' : ''}
                onClick={() => handleToolSelect('Length')}
                title="Length Measurement"
                disabled={!isElementEnabled}
              >
                📏 Length
              </button>
              <button
                className={activeTool === 'Angle' ? 'active' : ''}
                onClick={() => handleToolSelect('Angle')}
                title="Angle Measurement"
                disabled={!isElementEnabled}
              >
                📐 Angle
              </button>
              <button
                className={activeTool === 'EllipticalRoi' ? 'active' : ''}
                onClick={() => handleToolSelect('EllipticalRoi')}
                title="Ellipse ROI"
                disabled={!isElementEnabled}
              >
                ⭕ ROI
              </button>
            </div>

            <div className="toolbar-separator"></div>

            {/* Transform */}
            <div className="toolbar-group">
              <button 
                onClick={handleInvert} 
                title="Invert Colors"
                disabled={!isElementEnabled}
              >
                🔄 Invert
              </button>
              <button 
                onClick={handleRotateLeft} 
                title="Rotate Left"
                disabled={!isElementEnabled}
              >
                ↶
              </button>
              <button 
                onClick={handleRotateRight} 
                title="Rotate Right"
                disabled={!isElementEnabled}
              >
                ↷
              </button>
              <button 
                onClick={handleFlipH} 
                title="Flip Horizontal"
                disabled={!isElementEnabled}
              >
                ↔️
              </button>
              <button 
                onClick={handleFlipV} 
                title="Flip Vertical"
                disabled={!isElementEnabled}
              >
                ↕️
              </button>
            </div>

            <div className="toolbar-separator"></div>

            {/* Advanced Features */}
            <div className="toolbar-group">
              <select
                value={windowPreset}
                onChange={(e) => handleWindowPresetChange(e.target.value)}
                className="preset-selector"
                disabled={!isElementEnabled}
                title="Window/Level Presets"
              >
                {Object.keys(WINDOW_PRESETS).map(preset => (
                  <option key={preset} value={preset}>{preset}</option>
                ))}
              </select>
              <button
                className={cineMode ? 'active' : ''}
                onClick={toggleCineMode}
                title={`Cine Mode (${cineSpeed} fps) - Press 'C'`}
                disabled={instances.length < 2 || !isElementEnabled}
              >
                {cineMode ? '⏸️ Stop' : '▶️ Cine'}
              </button>
              <button
                onClick={() => handleExport('png')}
                title="Export as PNG - Press 'E'"
                disabled={!isElementEnabled}
              >
                📷 PNG
              </button>
              <button
                onClick={() => handleExport('jpeg')}
                title="Export as JPEG"
                disabled={!isElementEnabled}
              >
                📷 JPG
              </button>
              <button
                className={showHistogram ? 'active' : ''}
                onClick={() => {
                  const newState = !showHistogram;
                  setShowHistogram(newState);
                  if (newState && currentImage) {
                    const hist = calculateHistogram(currentImage);
                    setHistogramData(hist);
                  }
                }}
                title="Show Histogram - Press 'H'"
                disabled={!isElementEnabled}
              >
                📊 Hist
              </button>
              <button
                className={showDicomTags ? 'active' : ''}
                onClick={() => {
                  const newState = !showDicomTags;
                  setShowDicomTags(newState);
                  if (newState && currentImage) {
                    const tags = getDicomTags(currentImage);
                    setDicomTags(tags);
                  }
                }}
                title="Show DICOM Tags - Press 'T'"
                disabled={!isElementEnabled}
              >
                🏷️ Tags
              </button>
              <button
                onClick={() => {
                  if (instances.length > 1) {
                    setShow3DViewer(true);
                  } else {
                    alert('Need at least 2 images for 3D rendering');
                  }
                }}
                title="3D Volume Rendering"
                disabled={instances.length < 2 || !isElementEnabled}
              >
                🎯 3D View
              </button>
              <button
                onClick={() => {
                  if (instances.length > 1) {
                    setShowMPRViewer(true);
                  } else {
                    alert('Need at least 2 images for MPR');
                  }
                }}
                title="Multi-Planar Reconstruction"
                disabled={instances.length < 2 || !isElementEnabled}
              >
                📐 MPR
              </button>
            </div>

            <div className="toolbar-separator"></div>

            {/* Actions */}
            <div className="toolbar-group">
              <button 
                onClick={handleClearAnnotations} 
                title="Clear Annotations"
                disabled={!isElementEnabled}
              >
                🗑️ Clear
              </button>
              <button 
                onClick={handleReset} 
                title="Reset View - Press 'R'"
                disabled={!isElementEnabled}
              >
                🔄 Reset
              </button>
              <button 
                onClick={handleDownload} 
                title="Download DICOM"
                disabled={instances.length === 0}
              >
                💾 Download
              </button>
            </div>
          </div>

          {/* Canvas */}
          <div className="viewer-canvas-container">
            {imageLoading && (
              <div className="image-loading-overlay">
                <div className="spinner"></div>
                <p>Loading image...</p>
              </div>
            )}
            {!isElementEnabled && !imageLoading && (
              <div className="image-loading-overlay">
                <p>Initializing viewer...</p>
              </div>
            )}
            <div
              ref={viewerRef}
              className="cornerstone-element"
              style={{ width: '100%', height: '100%', background: '#000' }}
            />
            
            {/* Image Info Overlay */}
            {imageInfo && isElementEnabled && (
              <div className="image-info-overlay">
                <div className="info-item">
                  <span>Size:</span> {imageInfo.rows} × {imageInfo.columns}
                </div>
                <div className="info-item">
                  <span>WW/WL:</span> {imageInfo.windowWidth} / {imageInfo.windowCenter}
                </div>
                <div className="info-item">
                  <span>Instance:</span> {instances[currentIndex]?.instance_number}
                </div>
              </div>
            )}
          </div>

          {/* Bottom Info */}
          {instances.length > 0 && (
            <div className="image-details">
              <p>
                <strong>Series:</strong> {selectedSeries}
              </p>
              <p>
                <strong>SOP Instance UID:</strong> {instances[currentIndex]?.sop_instance_uid}
              </p>
            </div>
          )}

          {/* Histogram Panel */}
          {showHistogram && histogramData && (
            <div className="histogram-panel">
              <div className="panel-header">
                <h4>📊 Histogram</h4>
                <button onClick={() => setShowHistogram(false)}>×</button>
        </div>
              <div className="histogram-container">
                <svg width="100%" height="150" style={{ maxWidth: '400px' }}>
                  {histogramData.bins.map((value, idx) => {
                    const maxBin = Math.max(...histogramData.bins);
                    const height = (value / maxBin) * 140;
                    const x = (idx / histogramData.bins.length) * 100 + '%';
                    return (
                      <rect
                        key={idx}
                        x={x}
                        y={150 - height}
                        width="3"
                        height={height}
                        fill="#4CAF50"
                        opacity={0.7}
                      />
                    );
                  })}
                </svg>
                <div className="histogram-info">
                  <p>Min: {histogramData.min} | Max: {histogramData.max}</p>
                  <p>Total Pixels: {histogramData.total.toLocaleString()}</p>
      </div>
              </div>
            </div>
          )}

          {/* DICOM Tags Panel */}
          {showDicomTags && dicomTags && (
            <div className="dicom-tags-panel">
              <div className="panel-header">
                <h4>🏷️ DICOM Tags</h4>
                <button onClick={() => setShowDicomTags(false)}>×</button>
              </div>
              <div className="tags-container">
                {Object.entries(dicomTags).map(([tag, value]) => (
                  <div key={tag} className="tag-item">
                    <span className="tag-name">{tag}:</span>
                    <span className="tag-value">{String(value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 3D Volume Renderer Modal */}
      {show3DViewer && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 1000,
          background: '#1a202c'
        }}>
          <VolumeRenderer3D
            instances={instances}
            studyUid={studyUid}
            onClose={() => setShow3DViewer(false)}
          />
        </div>
      )}

      {/* MPR Viewer Modal */}
      {showMPRViewer && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 1000,
          background: '#1a202c'
        }}>
          <MPRViewer
            instances={instances}
            studyUid={studyUid}
            onClose={() => setShowMPRViewer(false)}
          />
        </div>
      )}
    </div>
  );
}

export default AdvancedStudyViewer;

