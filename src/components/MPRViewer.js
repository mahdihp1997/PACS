import React, { useEffect, useRef, useState, useCallback } from 'react';
import { pacsAPI } from '../services/api';
import * as cornerstone from 'cornerstone-core';
import * as cornerstoneTools from 'cornerstone-tools';
import {
  enableTools,
  setActiveTool,
  clearTools
} from '../utils/cornerstoneSetup';

/**
 * MPRViewer - Multi-Planar Reconstruction Viewer
 * نمایش سه view مختلف از یک volume: Axial, Sagittal, Coronal
 */
function MPRViewer({ instances, onClose, studyUid }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [volumeData, setVolumeData] = useState(null);
  const [activeView, setActiveView] = useState('axial'); // 'axial', 'sagittal', 'coronal'
  const [sliceIndex, setSliceIndex] = useState({ axial: 0, sagittal: 0, coronal: 0 });
  
  const axialRef = useRef(null);
  const sagittalRef = useRef(null);
  const coronalRef = useRef(null);
  
  const [activeTool, setActiveToolState] = useState('Wwwc');

  useEffect(() => {
    if (!instances || instances.length === 0) {
      setError('No instances provided');
      setLoading(false);
      return;
    }

    loadVolumeData(instances).then(() => {
      setLoading(false);
    }).catch(err => {
      console.error('Error loading MPR data:', err);
      setError('Failed to load volume data');
      setLoading(false);
    });

    return () => {
      [axialRef, sagittalRef, coronalRef].forEach(ref => {
        if (ref.current) {
          try {
            cornerstone.disable(ref.current);
          } catch (e) {
            console.error('Error disabling viewport:', e);
          }
        }
      });
    };
  }, [instances]);

  // Initialize viewports
  useEffect(() => {
    if (!volumeData) return;

    const initViewport = async (ref, viewType) => {
      if (!ref.current) return;

      try {
        cornerstone.enable(ref.current);
        enableTools(ref.current);
        setActiveTool(ref.current, 'Wwwc');
        setActiveToolState('Wwwc');

        // Wait a bit for cornerstone to initialize
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Load initial slice
        loadSlice(ref.current, viewType, sliceIndex[viewType]);
      } catch (err) {
        console.error(`Error initializing ${viewType} viewport:`, err);
      }
    };

    Promise.all([
      initViewport(axialRef, 'axial'),
      initViewport(sagittalRef, 'sagittal'),
      initViewport(coronalRef, 'coronal')
    ]);
  }, [volumeData]);

  // Load volume data
  const loadVolumeData = async (instanceList) => {
    try {
      console.log(`Loading ${instanceList.length} instances for MPR...`);

      // Sort instances
      const sortedInstances = [...instanceList].sort((a, b) => 
        parseInt(a.instance_number || 0) - parseInt(b.instance_number || 0)
      );

      // Load first image to get dimensions
      const firstImageId = `wadouri:${pacsAPI.getInstanceFile(sortedInstances[0].sop_instance_uid)}`;
      const firstImage = await cornerstone.loadImage(firstImageId);

      const width = firstImage.columns || 256;
      const height = firstImage.rows || 256;
      const depth = sortedInstances.length;

      // Load all slices (with limited concurrency)
      const pixelDataArray = [];
      const concurrency = 5;

      for (let i = 0; i < sortedInstances.length; i += concurrency) {
        const batch = sortedInstances.slice(i, i + concurrency);
        const batchResults = await Promise.all(
          batch.map(async (instance) => {
            try {
              const imageId = `wadouri:${pacsAPI.getInstanceFile(instance.sop_instance_uid)}`;
              const image = await cornerstone.loadImage(imageId);
              
              let pixelData;
              if (image.getPixelData) {
                pixelData = image.getPixelData();
              } else if (image.pixelData) {
                pixelData = image.pixelData;
              } else {
                return null;
              }

              return {
                pixelData: Array.from(pixelData),
                image: image,
                instance: instance
              };
            } catch (err) {
              console.error(`Error loading instance:`, err);
              return null;
            }
          })
        );

        pixelDataArray.push(...batchResults.filter(Boolean));
        
        if (pixelDataArray.length % 10 === 0) {
          console.log(`Loaded ${pixelDataArray.length}/${depth} slices...`);
        }
      }

      console.log(`Volume data loaded: ${pixelDataArray.length} slices`);

      setVolumeData({
        width,
        height,
        depth: pixelDataArray.length,
        slices: pixelDataArray,
        dimensions: { width, height, depth: pixelDataArray.length }
      });

      // Set initial slice indices
      setSliceIndex({
        axial: Math.floor(pixelDataArray.length / 2),
        sagittal: Math.floor(width / 2),
        coronal: Math.floor(height / 2)
      });

    } catch (err) {
      console.error('Error loading volume data:', err);
      throw err;
    }
  };

  // Extract slice from volume
  const getSlice = (viewType, index) => {
    if (!volumeData) return null;

    const { slices, width, height, depth } = volumeData;
    const sliceData = new Uint16Array(width * height);

    switch (viewType) {
      case 'axial':
        // Axial: XY plane (Z = index)
        if (index < 0 || index >= depth) return null;
        const axialSlice = slices[index];
        if (!axialSlice) return null;
        
        for (let i = 0; i < width * height && i < axialSlice.pixelData.length; i++) {
          sliceData[i] = axialSlice.pixelData[i];
        }
        
        return {
          pixelData: sliceData,
          width,
          height,
          image: axialSlice.image,
          instance: axialSlice.instance
        };

      case 'sagittal':
        // Sagittal: YZ plane (X = index)
        if (index < 0 || index >= width) return null;
        
        for (let z = 0; z < depth; z++) {
          const slice = slices[z];
          if (!slice) continue;
          
          for (let y = 0; y < height; y++) {
            const srcIdx = y * width + index;
            const dstIdx = z * height + y;
            if (srcIdx < slice.pixelData.length && dstIdx < sliceData.length) {
              sliceData[dstIdx] = slice.pixelData[srcIdx];
            }
          }
        }
        
        return {
          pixelData: sliceData,
          width: depth,
          height,
          image: slices[0]?.image,
          instance: slices[0]?.instance
        };

      case 'coronal':
        // Coronal: XZ plane (Y = index)
        if (index < 0 || index >= height) return null;
        
        for (let z = 0; z < depth; z++) {
          const slice = slices[z];
          if (!slice) continue;
          
          for (let x = 0; x < width; x++) {
            const srcIdx = index * width + x;
            const dstIdx = z * width + x;
            if (srcIdx < slice.pixelData.length && dstIdx < sliceData.length) {
              sliceData[dstIdx] = slice.pixelData[srcIdx];
            }
          }
        }
        
        return {
          pixelData: sliceData,
          width,
          height: depth,
          image: slices[0]?.image,
          instance: slices[0]?.instance
        };

      default:
        return null;
    }
  };

  // Load slice to viewport
  const loadSlice = async (element, viewType, index) => {
    if (!volumeData || !element) return;

    const slice = getSlice(viewType, index);
    if (!slice) return;

    try {
      // Create a pseudo-image object for cornerstone
      const image = {
        ...slice.image,
        pixelData: slice.pixelData,
        getPixelData: () => slice.pixelData,
        rows: slice.height,
        columns: slice.width,
        width: slice.width,
        height: slice.height
      };

      cornerstone.displayImage(element, image);

      // Setup stack state
      const maxSlices = viewType === 'axial' 
        ? volumeData.depth 
        : viewType === 'sagittal' 
          ? volumeData.width 
          : volumeData.height;

      cornerstoneTools.addStackStateManager(element, ['stack']);
      cornerstoneTools.addToolState(element, 'stack', {
        imageIds: Array(maxSlices).fill(0).map((_, i) => `slice-${viewType}-${i}`),
        currentImageIdIndex: index
      });

      cornerstone.updateImage(element);
    } catch (err) {
      console.error(`Error loading ${viewType} slice:`, err);
    }
  };

  // Handle slice navigation
  const handleSliceChange = (viewType, direction) => {
    const currentIndex = sliceIndex[viewType];
    let maxSlices;

    switch (viewType) {
      case 'axial':
        maxSlices = volumeData.depth - 1;
        break;
      case 'sagittal':
        maxSlices = volumeData.width - 1;
        break;
      case 'coronal':
        maxSlices = volumeData.height - 1;
        break;
      default:
        return;
    }

    let newIndex = currentIndex + direction;
    if (newIndex < 0) newIndex = 0;
    if (newIndex > maxSlices) newIndex = maxSlices;

    setSliceIndex(prev => ({
      ...prev,
      [viewType]: newIndex
    }));

    // Get appropriate ref
    const ref = viewType === 'axial' 
      ? axialRef 
      : viewType === 'sagittal' 
        ? sagittalRef 
        : coronalRef;

    if (ref.current) {
      loadSlice(ref.current, viewType, newIndex);
    }
  };

  // Update slice when index changes
  useEffect(() => {
    if (!volumeData) return;

    ['axial', 'sagittal', 'coronal'].forEach(viewType => {
      const ref = viewType === 'axial' 
        ? axialRef 
        : viewType === 'sagittal' 
          ? sagittalRef 
          : coronalRef;
      
      if (ref.current) {
        loadSlice(ref.current, viewType, sliceIndex[viewType]);
      }
    });
  }, [sliceIndex, volumeData]);

  if (loading) {
    return (
      <div style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#1a202c',
        color: 'white'
      }}>
        <div className="spinner"></div>
        <p>Loading MPR Views...</p>
        <p style={{ fontSize: '0.8rem', color: '#a0aec0' }}>
          Processing {instances?.length || 0} slices...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#1a202c',
        color: 'white',
        padding: '2rem'
      }}>
        <h3 style={{ color: '#f56565' }}>❌ Error</h3>
        <p>{error}</p>
        <button
          onClick={onClose}
          style={{
            padding: '0.5rem 1rem',
            marginTop: '1rem',
            background: '#667eea',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer'
          }}
        >
          Close
        </button>
      </div>
    );
  }

  const Viewport = ({ viewType, title }) => {
    const ref = viewType === 'axial' ? axialRef : viewType === 'sagittal' ? sagittalRef : coronalRef;
    const currentSlice = sliceIndex[viewType];
    const maxSlices = viewType === 'axial' 
      ? (volumeData?.depth || 0) - 1
      : viewType === 'sagittal' 
        ? (volumeData?.width || 0) - 1
        : (volumeData?.height || 0) - 1;

    return (
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        border: `2px solid ${activeView === viewType ? '#667eea' : '#4a5568'}`,
        borderRadius: '5px',
        overflow: 'hidden'
      }}>
        <div style={{
          padding: '0.5rem',
          background: '#2d3748',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <strong style={{ color: 'white' }}>{title}</strong>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button
              onClick={() => handleSliceChange(viewType, -1)}
              disabled={currentSlice === 0}
              style={{
                padding: '0.25rem 0.5rem',
                background: currentSlice === 0 ? '#2d3748' : '#4a5568',
                color: 'white',
                border: 'none',
                borderRadius: '3px',
                cursor: currentSlice === 0 ? 'not-allowed' : 'pointer'
              }}
            >
              ◀
            </button>
            <span style={{ color: '#a0aec0', fontSize: '0.85rem' }}>
              {currentSlice + 1} / {maxSlices + 1}
            </span>
            <button
              onClick={() => handleSliceChange(viewType, 1)}
              disabled={currentSlice >= maxSlices}
              style={{
                padding: '0.25rem 0.5rem',
                background: currentSlice >= maxSlices ? '#2d3748' : '#4a5568',
                color: 'white',
                border: 'none',
                borderRadius: '3px',
                cursor: currentSlice >= maxSlices ? 'not-allowed' : 'pointer'
              }}
            >
              ▶
            </button>
          </div>
        </div>
        <div
          ref={ref}
          style={{
            flex: 1,
            background: '#000',
            cursor: 'crosshair'
          }}
          onClick={() => setActiveView(viewType)}
        />
      </div>
    );
  };

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#1a202c' }}>
      {/* Header */}
      <div style={{
        padding: '0.75rem 1rem',
        background: '#2d3748',
        borderBottom: '2px solid #4a5568',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <h3 style={{ color: 'white', margin: 0 }}>Multi-Planar Reconstruction (MPR)</h3>
        <button
          onClick={onClose}
          style={{
            padding: '0.5rem 1rem',
            background: '#4a5568',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer'
          }}
        >
          Close MPR
        </button>
      </div>

      {/* Viewports Grid */}
      <div style={{
        flex: 1,
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gridTemplateRows: '1fr 1fr',
        gap: '4px',
        padding: '4px'
      }}>
        <div style={{ gridColumn: '1 / 3' }}>
          <Viewport viewType="axial" title="Axial View (XY Plane)" />
        </div>
        <Viewport viewType="sagittal" title="Sagittal View (YZ Plane)" />
        <Viewport viewType="coronal" title="Coronal View (XZ Plane)" />
      </div>

      {/* Info */}
      <div style={{
        padding: '0.5rem 1rem',
        background: '#2d3748',
        borderTop: '2px solid #4a5568',
        color: '#a0aec0',
        fontSize: '0.85rem'
      }}>
        Volume: {volumeData?.width} × {volumeData?.height} × {volumeData?.depth} | 
        Click viewport to activate | Use arrow keys or buttons to navigate slices
      </div>
    </div>
  );
}

export default MPRViewer;


