import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { pacsAPI } from '../services/api';
import * as cornerstone from 'cornerstone-core';
import * as cornerstoneTools from 'cornerstone-tools';
import {
  initializeCornerstone,
  enableTools,
  setActiveTool,
  clearTools
} from '../utils/cornerstoneSetup';
import {
  WINDOW_PRESETS,
  applyWindowPreset,
  exportImage,
  calculateHistogram,
  getDicomTags
} from '../utils/viewerUtils';
import './MultiViewLayout.css';

function MultiViewLayout() {
  const { studyUid } = useParams();
  const navigate = useNavigate();
  
  const [study, setStudy] = useState(null);
  const [series, setSeries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTool, setActiveToolState] = useState('Wwwc');
  const [layout, setLayout] = useState('1x1'); // 1x1, 1x2, 2x2, 2x3
  const [viewports, setViewports] = useState([]);
  const [activeViewport, setActiveViewport] = useState(0);
  const [syncEnabled, setSyncEnabled] = useState(false);
  const [viewportsReady, setViewportsReady] = useState([]);
  const [imageLoadingStates, setImageLoadingStates] = useState([]);
  
  // Advanced features state
  const [windowPreset, setWindowPreset] = useState('Default');
  const [showHistogram, setShowHistogram] = useState(false);
  const [histogramData, setHistogramData] = useState(null);
  const [showDicomTags, setShowDicomTags] = useState(false);
  const [dicomTags, setDicomTags] = useState(null);
  const [currentImages, setCurrentImages] = useState([]);
  const [cineMode, setCineMode] = useState(false);
  const [cineSpeed] = useState(5); // frames per second
  
  const viewportRefs = useRef([]);
  const viewportElements = useRef([]);
  const isInitializing = useRef(false);
  const cineIntervalRef = useRef(null);

  useEffect(() => {
    initializeCornerstone();
    loadStudyData();
    
    return () => {
      // Cleanup all viewports
      viewportElements.current.forEach(element => {
        if (element) {
          try {
            cornerstone.disable(element);
          } catch (e) {
            console.error('Error disabling viewport:', e);
          }
        }
      });
      viewportElements.current = [];
      viewportRefs.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studyUid]);

  useEffect(() => {
    if (!loading && series.length > 0) {
      initializeViewports();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, series, loading]);

  const loadStudyData = async () => {
    try {
      setLoading(true);
      
      const [studyRes, seriesRes] = await Promise.all([
        pacsAPI.getStudy(studyUid),
        pacsAPI.getStudySeries(studyUid)
      ]);
      
      setStudy(studyRes.data);
      
      // DON'T load all instances upfront - load them on demand
      setSeries(seriesRes.data);
      
      // Initialize viewport structure
      const viewportCount = getViewportCount(layout);
      const initialViewports = Array(viewportCount).fill(null).map(() => ({
        seriesData: null,
        instances: [],
        currentIndex: 0,
        imageInfo: null
      }));
      
      setViewports(initialViewports);
      setViewportsReady(Array(viewportCount).fill(false));
      setImageLoadingStates(Array(viewportCount).fill(false));
      setCurrentImages(Array(viewportCount).fill(null));
      
      setError(null);
      console.log(`Loaded ${seriesRes.data.length} series`);
    } catch (err) {
      setError('Failed to load study: ' + err.message);
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const getViewportCount = (layoutType) => {
    const counts = {
      '1x1': 1,
      '1x2': 2,
      '2x2': 4,
      '2x3': 6
    };
    return counts[layoutType] || 1;
  };

  const initializeViewports = async () => {
    if (isInitializing.current) {
      console.log('Already initializing, skipping...');
      return;
    }
    
    isInitializing.current = true;
    const count = getViewportCount(layout);
    
    console.log(`Initializing ${count} viewports for layout ${layout}`);
    
    // Clear existing elements
    viewportElements.current.forEach(element => {
      if (element) {
        try {
          cornerstone.disable(element);
        } catch (e) {
          console.error('Error disabling viewport:', e);
        }
      }
    });
    
    viewportElements.current = Array(count).fill(null);
    setViewportsReady(Array(count).fill(false));
    
    // Don't auto-populate viewports, let user select manually
    // Just ensure we have empty slots
    setViewports(prev => {
      const newViewports = [];
      for (let i = 0; i < count; i++) {
        // Keep existing viewport data if it exists, otherwise create empty
        newViewports.push(prev[i] || {
          seriesData: null,
          instances: [],
          currentIndex: 0,
          imageInfo: null
        });
      }
      return newViewports;
    });
    
    // Wait for DOM to be ready
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Initialize each viewport sequentially
    for (let idx = 0; idx < count; idx++) {
      const ref = viewportRefs.current[idx];
      if (ref) {
        try {
          cornerstone.enable(ref);
          enableTools(ref);
          setActiveTool(ref, activeTool);
          viewportElements.current[idx] = ref;
          
          setViewportsReady(prev => {
            const newReady = [...prev];
            newReady[idx] = true;
            return newReady;
          });
          
          console.log(`Viewport ${idx} enabled`);
          
          // Small delay between viewport initializations
          await new Promise(resolve => setTimeout(resolve, 50));
        } catch (e) {
          console.error(`Error enabling viewport ${idx}:`, e);
        }
      }
    }
    
    isInitializing.current = false;
  };

  const loadSeriesInstances = useCallback(async (seriesUid) => {
    try {
      console.log(`Loading instances for series ${seriesUid}`);
      const response = await pacsAPI.getSeriesInstances(seriesUid);
      const sortedInstances = response.data.sort((a, b) => 
        parseInt(a.instance_number) - parseInt(b.instance_number)
      );
      console.log(`Loaded ${sortedInstances.length} instances`);
      return sortedInstances;
    } catch (err) {
      console.error('Error loading series instances:', err);
      throw err;
    }
  }, []);

  const loadViewportImage = async (viewportIndex) => {
    const viewport = viewports[viewportIndex];
    if (!viewport || !viewport.instances || viewport.instances.length === 0) {
      console.warn(`Cannot load image for viewport ${viewportIndex}: no instances`);
      return;
    }
    
    const element = viewportElements.current[viewportIndex];
    if (!element || !viewportsReady[viewportIndex]) {
      console.warn(`Cannot load image for viewport ${viewportIndex}: element not ready`);
      return;
    }

    try {
      setImageLoadingStates(prev => {
        const newStates = [...prev];
        newStates[viewportIndex] = true;
        return newStates;
      });
      
      const instance = viewport.instances[viewport.currentIndex];
      if (!instance) {
        console.warn(`No instance at index ${viewport.currentIndex}`);
        return;
      }
      
      const imageId = `wadouri:${pacsAPI.getInstanceFile(instance.sop_instance_uid)}`;
      console.log(`Loading image for viewport ${viewportIndex}:`, imageId);
      
      const image = await cornerstone.loadImage(imageId);
      cornerstone.displayImage(element, image);
      
      // Store current image for active viewport
      if (viewportIndex === activeViewport) {
        setCurrentImages(prev => {
          const updated = [...prev];
          updated[viewportIndex] = image;
          return updated;
        });
        
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
      }
      
      // Setup stack
      const imageIds = viewport.instances.map(inst =>
        `wadouri:${pacsAPI.getInstanceFile(inst.sop_instance_uid)}`
      );
      
      cornerstoneTools.addStackStateManager(element, ['stack']);
      cornerstoneTools.addToolState(element, 'stack', {
        imageIds: imageIds,
        currentImageIdIndex: viewport.currentIndex
      });
      
      // Update viewport info
      setViewports(prev => {
        const newViewports = [...prev];
        newViewports[viewportIndex] = {
          ...viewport,
          imageInfo: {
            rows: image.rows,
            columns: image.columns,
            windowCenter: image.windowCenter || 'N/A',
            windowWidth: image.windowWidth || 'N/A'
          }
        };
        return newViewports;
      });
      
      console.log(`Image loaded successfully for viewport ${viewportIndex}`);
    } catch (err) {
      console.error(`Error loading viewport ${viewportIndex} image:`, err);
      alert(`Failed to load image: ${err.message}`);
    } finally {
      setImageLoadingStates(prev => {
        const newStates = [...prev];
        newStates[viewportIndex] = false;
        return newStates;
      });
    }
  };

  const handleLayoutChange = (newLayout) => {
    console.log(`Changing layout to ${newLayout}`);
    setLayout(newLayout);
    
    // Reset all viewports when layout changes
    const count = getViewportCount(newLayout);
    const emptyViewports = Array(count).fill(null).map(() => ({
      seriesData: null,
      instances: [],
      currentIndex: 0,
      imageInfo: null
    }));
    
    setViewports(emptyViewports);
    setViewportsReady(Array(count).fill(false));
    setImageLoadingStates(Array(count).fill(false));
    setCurrentImages(Array(count).fill(null));
    
    console.log(`Layout changed to ${newLayout}, all viewports reset`);
  };

  const handleToolSelect = (toolName) => {
    console.log(`Selecting tool: ${toolName}`);
    setActiveToolState(toolName);
    viewportElements.current.forEach((element, idx) => {
      if (element && viewportsReady[idx]) {
        try {
          setActiveTool(element, toolName);
        } catch (e) {
          console.error(`Error setting tool for viewport ${idx}:`, e);
        }
      }
    });
  };

  const handleSeriesSelect = async (viewportIndex, seriesUid) => {
    if (!viewportsReady[viewportIndex]) {
      console.warn(`Viewport ${viewportIndex} not ready`);
      return;
    }
    
    try {
      setImageLoadingStates(prev => {
        const newStates = [...prev];
        newStates[viewportIndex] = true;
        return newStates;
      });
      
      const selectedSeries = series.find(s => s.series_instance_uid === seriesUid);
      if (!selectedSeries) {
        console.warn('Series not found');
        return;
      }
      
      // Load instances for this series
      const instances = await loadSeriesInstances(seriesUid);
      
      // Update viewport
      setViewports(prev => {
        const newViewports = [...prev];
        newViewports[viewportIndex] = {
          seriesData: selectedSeries,
          instances: instances,
          currentIndex: 0,
          imageInfo: null
        };
        return newViewports;
      });
      
      // Wait a bit for state to update
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Load first image
      const element = viewportElements.current[viewportIndex];
      if (element && instances.length > 0) {
        const instance = instances[0];
        const imageId = `wadouri:${pacsAPI.getInstanceFile(instance.sop_instance_uid)}`;
        
        const image = await cornerstone.loadImage(imageId);
        cornerstone.displayImage(element, image);
        
        // Store current image for active viewport
        if (viewportIndex === activeViewport) {
          setCurrentImages(prev => {
            const updated = [...prev];
            updated[viewportIndex] = image;
            return updated;
          });
          
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
        }
        
        // Setup stack
        const imageIds = instances.map(inst =>
          `wadouri:${pacsAPI.getInstanceFile(inst.sop_instance_uid)}`
        );
        
        cornerstoneTools.addStackStateManager(element, ['stack']);
        cornerstoneTools.addToolState(element, 'stack', {
          imageIds: imageIds,
          currentImageIdIndex: 0
        });
        
        // Update info
        setViewports(prev => {
          const newViewports = [...prev];
          newViewports[viewportIndex] = {
            ...newViewports[viewportIndex],
            imageInfo: {
              rows: image.rows,
              columns: image.columns,
              windowCenter: image.windowCenter || 'N/A',
              windowWidth: image.windowWidth || 'N/A'
            }
          };
          return newViewports;
        });
        
        console.log(`Series loaded for viewport ${viewportIndex}`);
      }
    } catch (err) {
      console.error('Error loading series:', err);
      alert('Failed to load series: ' + err.message);
    } finally {
      setImageLoadingStates(prev => {
        const newStates = [...prev];
        newStates[viewportIndex] = false;
        return newStates;
      });
    }
  };

  const syncViewports = useCallback(async (targetIndex, sourceViewportIndex) => {
    for (let idx = 0; idx < viewports.length; idx++) {
      if (idx === sourceViewportIndex) continue;
      
      const viewport = viewports[idx];
      if (!viewport || !viewport.instances || viewport.instances.length === 0) continue;
      
      const maxIndex = viewport.instances.length - 1;
      const newIndex = Math.min(targetIndex, maxIndex);
      
      if (newIndex === viewport.currentIndex) continue;
      
      const element = viewportElements.current[idx];
      if (element && viewportsReady[idx]) {
        try {
          const instance = viewport.instances[newIndex];
          const imageId = `wadouri:${pacsAPI.getInstanceFile(instance.sop_instance_uid)}`;
          
          const image = await cornerstone.loadImage(imageId);
          cornerstone.displayImage(element, image);
          
          // Store current image if this is active viewport
          if (idx === sourceViewportIndex || idx === activeViewport) {
            setCurrentImages(prev => {
              const updated = [...prev];
              updated[idx] = image;
              return updated;
            });
          }
          
          // Update state
          setViewports(prev => {
            const newViewports = [...prev];
            newViewports[idx] = {
              ...viewport,
              currentIndex: newIndex
            };
            return newViewports;
          });
        } catch (err) {
          console.error(`Error syncing viewport ${idx}:`, err);
        }
      }
    }
  }, [viewports, viewportsReady]);

  const handleImageScroll = useCallback(async (viewportIndex, direction) => {
    const viewport = viewports[viewportIndex];
    if (!viewport || !viewport.instances || viewport.instances.length === 0) return;
    
    const maxIndex = viewport.instances.length - 1;
    let newIndex = viewport.currentIndex + direction;
    
    if (newIndex < 0) newIndex = 0;
    if (newIndex > maxIndex) newIndex = maxIndex;
    
    if (newIndex === viewport.currentIndex) return;
    
    // Update current index
    setViewports(prev => {
      const newViewports = [...prev];
      newViewports[viewportIndex] = {
        ...viewport,
        currentIndex: newIndex
      };
      return newViewports;
    });
    
    // Load new image
    const element = viewportElements.current[viewportIndex];
    if (element && viewportsReady[viewportIndex]) {
      try {
        const instance = viewport.instances[newIndex];
        const imageId = `wadouri:${pacsAPI.getInstanceFile(instance.sop_instance_uid)}`;
        
        const image = await cornerstone.loadImage(imageId);
        cornerstone.displayImage(element, image);
        
        // Store current image for active viewport
        if (viewportIndex === activeViewport) {
          setCurrentImages(prev => {
            const updated = [...prev];
            updated[viewportIndex] = image;
            return updated;
          });
          
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
        }
        
        // Update stack state
        const stackState = cornerstoneTools.getToolState(element, 'stack');
        if (stackState && stackState.data && stackState.data.length > 0) {
          stackState.data[0].currentImageIdIndex = newIndex;
        }
      } catch (err) {
        console.error('Error scrolling image:', err);
      }
    }
    
    // Sync other viewports if enabled
    if (syncEnabled) {
      syncViewports(newIndex, viewportIndex);
    }
  }, [viewports, viewportsReady, syncEnabled, syncViewports]);

  const handleZoom = (viewportIndex, direction) => {
    const element = viewportElements.current[viewportIndex];
    if (!element || !viewportsReady[viewportIndex]) return;
    
    try {
      const viewport = cornerstone.getViewport(element);
      viewport.scale += direction * 0.25;
      if (viewport.scale < 0.25) viewport.scale = 0.25;
      cornerstone.setViewport(element, viewport);
      console.log(`Viewport ${viewportIndex} zoomed to scale ${viewport.scale}`);
    } catch (err) {
      console.error('Error zooming:', err);
    }
  };

  const handleReset = (viewportIndex) => {
    const element = viewportElements.current[viewportIndex];
    if (element && viewportsReady[viewportIndex]) {
      try {
        const image = cornerstone.getImage(element);
        if (image) {
          const viewport = cornerstone.getDefaultViewportForImage(element, image);
          cornerstone.setViewport(element, viewport);
          cornerstone.updateImage(element);
        }
        console.log(`Viewport ${viewportIndex} reset`);
      } catch (err) {
        console.error('Error resetting:', err);
      }
    }
  };

  const handleResetAll = () => {
    viewportElements.current.forEach((element, idx) => {
      if (element && viewportsReady[idx]) {
        try {
          const image = cornerstone.getImage(element);
          if (image) {
            const viewport = cornerstone.getDefaultViewportForImage(element, image);
            cornerstone.setViewport(element, viewport);
            cornerstone.updateImage(element);
          }
        } catch (err) {
          console.error(`Error resetting viewport ${idx}:`, err);
        }
      }
    });
    console.log('All viewports reset');
  };

  const handleClearAll = () => {
    viewportElements.current.forEach((element, idx) => {
      if (element && viewportsReady[idx]) {
        try {
          // Clear all tool states
          cornerstoneTools.clearToolState(element, 'Length');
          cornerstoneTools.clearToolState(element, 'Angle');
          cornerstoneTools.clearToolState(element, 'EllipticalRoi');
          cornerstoneTools.clearToolState(element, 'ArrowAnnotate');
          cornerstone.updateImage(element);
        } catch (err) {
          console.error(`Error clearing viewport ${idx}:`, err);
        }
      }
    });
    console.log('All annotations cleared');
  };

  // Window preset handler (apply to all viewports)
  const handleWindowPresetChange = (presetName) => {
    setWindowPreset(presetName);
    viewportElements.current.forEach((element, idx) => {
      if (element && viewportsReady[idx]) {
        applyWindowPreset(element, presetName);
      }
    });
  };

  // Export handler (active viewport only)
  const handleExport = async (format = 'png') => {
    try {
      const element = viewportElements.current[activeViewport];
      if (!element || !viewportsReady[activeViewport]) return;
      await exportImage(element, format);
    } catch (err) {
      console.error('Export failed:', err);
      alert('Failed to export image');
    }
  };

  // Cine mode handler
  const toggleCineMode = useCallback(() => {
    if (cineMode) {
      // Stop cine
      if (cineIntervalRef.current) {
        clearInterval(cineIntervalRef.current);
        cineIntervalRef.current = null;
      }
      setCineMode(false);
    } else {
      // Start cine - use functional update to get latest state
      setViewports(prev => {
        const viewport = prev[activeViewport];
        if (viewport && viewport.instances && viewport.instances.length > 1) {
          setCineMode(true);
          const interval = setInterval(() => {
            setViewports(currentViewports => {
              const currentViewport = currentViewports[activeViewport];
              if (!currentViewport || !currentViewport.instances || currentViewport.instances.length === 0) {
                setCineMode(false);
                if (cineIntervalRef.current) {
                  clearInterval(cineIntervalRef.current);
                  cineIntervalRef.current = null;
                }
                return currentViewports;
              }
              
              let nextIndex = currentViewport.currentIndex + 1;
              if (nextIndex >= currentViewport.instances.length) {
                // Loop back to start
                nextIndex = 0;
              }
              
              // Load next image using handleImageScroll
              handleImageScroll(activeViewport, nextIndex - currentViewport.currentIndex);
              
              // Update state
              const updated = [...currentViewports];
              updated[activeViewport] = {
                ...currentViewport,
                currentIndex: nextIndex
              };
              return updated;
            });
          }, 1000 / cineSpeed);
          cineIntervalRef.current = interval;
        }
        return prev;
      });
    }
  }, [cineMode, activeViewport, cineSpeed, handleImageScroll]);

  // Cleanup cine on unmount
  useEffect(() => {
    return () => {
      if (cineIntervalRef.current) {
        clearInterval(cineIntervalRef.current);
      }
    };
  }, []);

  // Update histogram/dicom tags when active viewport changes
  useEffect(() => {
    const image = currentImages[activeViewport];
    if (image) {
      if (showHistogram) {
        const hist = calculateHistogram(image);
        setHistogramData(hist);
      }
      if (showDicomTags) {
        const tags = getDicomTags(image);
        setDicomTags(tags);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeViewport]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
      
      switch(e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          const prevIdx = viewports[activeViewport]?.currentIndex || 0;
          if (prevIdx > 0) {
            handleImageScroll(activeViewport, -1);
          }
          break;
        case 'ArrowRight':
          e.preventDefault();
          const nextIdx = viewports[activeViewport]?.currentIndex || 0;
          const maxIdx = viewports[activeViewport]?.instances?.length - 1 || 0;
          if (nextIdx < maxIdx) {
            handleImageScroll(activeViewport, 1);
          }
          break;
        case '+':
        case '=':
          e.preventDefault();
          handleZoom(activeViewport, 1);
          break;
        case '-':
        case '_':
          e.preventDefault();
          handleZoom(activeViewport, -1);
          break;
        case 'r':
        case 'R':
          e.preventDefault();
          handleReset(activeViewport);
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
  }, [activeViewport, viewports, showHistogram, showDicomTags, toggleCineMode]);

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

  const viewportCount = getViewportCount(layout);

  return (
    <div className="multiview-container">
      {/* Header */}
      <div className="multiview-header">
        <button className="back-button" onClick={() => navigate(-1)}>
          ← Back
        </button>
        <div className="study-info">
          <h2>{study?.study_description || 'Multi-View Study'}</h2>
          <p>{study?.study_date}</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="multiview-toolbar">
        {/* Layout Selection */}
        <div className="toolbar-group">
          <span className="toolbar-label">Layout:</span>
          <button
            className={layout === '1x1' ? 'active' : ''}
            onClick={() => handleLayoutChange('1x1')}
            title="1x1"
          >
            ⬜
          </button>
          <button
            className={layout === '1x2' ? 'active' : ''}
            onClick={() => handleLayoutChange('1x2')}
            title="1x2"
          >
            ▬
          </button>
          <button
            className={layout === '2x2' ? 'active' : ''}
            onClick={() => handleLayoutChange('2x2')}
            title="2x2"
          >
            ▦
          </button>
          <button
            className={layout === '2x3' ? 'active' : ''}
            onClick={() => handleLayoutChange('2x3')}
            title="2x3"
          >
            ▧
          </button>
        </div>

        <div className="toolbar-separator"></div>

        {/* Tools */}
        <div className="toolbar-group">
          <button
            className={activeTool === 'Wwwc' ? 'active' : ''}
            onClick={() => handleToolSelect('Wwwc')}
          >
            🎚️ W/L
          </button>
          <button
            className={activeTool === 'Pan' ? 'active' : ''}
            onClick={() => handleToolSelect('Pan')}
          >
            ✋ Pan
          </button>
          <button
            className={activeTool === 'Length' ? 'active' : ''}
            onClick={() => handleToolSelect('Length')}
          >
            📏 Length
          </button>
          <button
            className={activeTool === 'Angle' ? 'active' : ''}
            onClick={() => handleToolSelect('Angle')}
          >
            📐 Angle
          </button>
        </div>

        <div className="toolbar-separator"></div>

        {/* Sync */}
        <div className="toolbar-group">
          <button
            className={syncEnabled ? 'active' : ''}
            onClick={() => setSyncEnabled(!syncEnabled)}
            title="Synchronize viewports"
          >
            🔗 {syncEnabled ? 'Synced' : 'Sync Off'}
          </button>
        </div>

        <div className="toolbar-separator"></div>

        {/* Advanced Features */}
        <div className="toolbar-group">
          <select
            value={windowPreset}
            onChange={(e) => handleWindowPresetChange(e.target.value)}
            className="preset-selector"
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
            disabled={!viewports[activeViewport]?.instances || viewports[activeViewport]?.instances.length < 2}
          >
            {cineMode ? '⏸️ Stop' : '▶️ Cine'}
          </button>
          <button
            onClick={() => handleExport('png')}
            title="Export Active Viewport as PNG - Press 'E'"
          >
            📷 PNG
          </button>
          <button
            onClick={() => handleExport('jpeg')}
            title="Export Active Viewport as JPEG"
          >
            📷 JPG
          </button>
          <button
            className={showHistogram ? 'active' : ''}
            onClick={() => {
              const newState = !showHistogram;
              setShowHistogram(newState);
              if (newState && currentImages[activeViewport]) {
                const hist = calculateHistogram(currentImages[activeViewport]);
                setHistogramData(hist);
              }
            }}
            title="Show Histogram - Press 'H'"
          >
            📊 Hist
          </button>
          <button
            className={showDicomTags ? 'active' : ''}
            onClick={() => {
              const newState = !showDicomTags;
              setShowDicomTags(newState);
              if (newState && currentImages[activeViewport]) {
                const tags = getDicomTags(currentImages[activeViewport]);
                setDicomTags(tags);
              }
            }}
            title="Show DICOM Tags - Press 'T'"
          >
            🏷️ Tags
          </button>
        </div>

        <div className="toolbar-separator"></div>

        {/* Actions */}
        <div className="toolbar-group">
          <button onClick={handleResetAll} title="Reset All Viewports - Press 'R'">
            🔄 Reset All
          </button>
          <button onClick={handleClearAll}>
            🗑️ Clear All
          </button>
        </div>
      </div>

      {/* Viewports Grid */}
      <div className={`viewports-grid layout-${layout}`}>
        {Array.from({ length: viewportCount }).map((_, idx) => (
          <div
            key={idx}
            className={`viewport-container ${activeViewport === idx ? 'active' : ''}`}
            onClick={() => setActiveViewport(idx)}
          >
            {/* Viewport Header */}
            <div className="viewport-header">
              <select
                value={viewports[idx]?.seriesData?.series_instance_uid || ''}
                onChange={(e) => {
                  if (e.target.value) {
                    handleSeriesSelect(idx, e.target.value);
                  }
                }}
                className="series-selector"
                disabled={!viewportsReady[idx] || imageLoadingStates[idx]}
              >
                <option value="">Select Series...</option>
                {series.map(s => (
                  <option key={s.series_instance_uid} value={s.series_instance_uid}>
                    {s.modality} - Series {s.series_number}
                  </option>
                ))}
              </select>
              
              {viewports[idx]?.instances && viewports[idx].instances.length > 0 && (
                <div className="viewport-controls">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleImageScroll(idx, -1);
                    }}
                    disabled={viewports[idx].currentIndex === 0 || imageLoadingStates[idx]}
                    title="Previous"
                  >
                    ◀
                  </button>
                  <span className="image-counter">
                    {viewports[idx].currentIndex + 1} / {viewports[idx].instances.length}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleImageScroll(idx, 1);
                    }}
                    disabled={viewports[idx].currentIndex === viewports[idx].instances.length - 1 || imageLoadingStates[idx]}
                    title="Next"
                  >
                    ▶
                  </button>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      handleZoom(idx, 1);
                    }} 
                    disabled={imageLoadingStates[idx]}
                    title="Zoom In"
                  >
                    +
                  </button>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      handleZoom(idx, -1);
                    }} 
                    disabled={imageLoadingStates[idx]}
                    title="Zoom Out"
                  >
                    -
                  </button>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      handleReset(idx);
                    }} 
                    disabled={imageLoadingStates[idx]}
                    title="Reset"
                  >
                    ⟲
                  </button>
                </div>
              )}
            </div>

            {/* Loading Indicator */}
            {imageLoadingStates[idx] && (
              <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                zIndex: 10,
                color: 'white',
                background: 'rgba(0,0,0,0.7)',
                padding: '10px 20px',
                borderRadius: '5px'
              }}>
                Loading...
              </div>
            )}

            {/* Canvas */}
            <div
              ref={el => viewportRefs.current[idx] = el}
              className="viewport-canvas"
              style={{ width: '100%', height: 'calc(100% - 50px)', background: '#000' }}
            />

            {/* Info Overlay */}
            {viewports[idx]?.imageInfo && (
              <div className="viewport-info">
                <div>{viewports[idx].imageInfo.rows} × {viewports[idx].imageInfo.columns}</div>
                <div>WW/WL: {viewports[idx].imageInfo.windowWidth} / {viewports[idx].imageInfo.windowCenter}</div>
              </div>
            )}

            {/* Viewport not ready indicator */}
            {!viewportsReady[idx] && (
              <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                color: '#666',
                fontSize: '14px'
              }}>
                Initializing viewport...
              </div>
            )}
            
            {/* Empty viewport message */}
            {viewportsReady[idx] && !viewports[idx]?.seriesData && !imageLoadingStates[idx] && (
              <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                color: '#999',
                fontSize: '16px',
                textAlign: 'center',
                pointerEvents: 'none'
              }}>
                <div style={{ fontSize: '48px', marginBottom: '10px' }}>📸</div>
                <div>Select a series from dropdown</div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Histogram Panel */}
      {showHistogram && histogramData && (
        <div className="histogram-panel">
          <div className="panel-header">
            <h4>📊 Histogram (Viewport {activeViewport + 1})</h4>
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
            <h4>🏷️ DICOM Tags (Viewport {activeViewport + 1})</h4>
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
  );
}

export default MultiViewLayout;

