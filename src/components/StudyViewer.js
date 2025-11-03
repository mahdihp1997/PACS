import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { pacsAPI } from '../services/api';
import * as cornerstone from 'cornerstone-core';
import * as cornerstoneWADOImageLoader from 'cornerstone-wado-image-loader';
import * as cornerstoneTools from 'cornerstone-tools';
import * as dicomParser from 'dicom-parser';
import './StudyViewer.css';

// Initialize cornerstone
cornerstoneWADOImageLoader.external.cornerstone = cornerstone;
cornerstoneWADOImageLoader.external.dicomParser = dicomParser;

// تنظیم Web Workers برای کدک‌ها
cornerstoneWADOImageLoader.webWorkerManager.initialize({
  maxWebWorkers: navigator.hardwareConcurrency || 4,
  startWebWorkersOnDemand: true,
  taskConfiguration: {
    decodeTask: {
      initializeCodecsOnStartup: true,
      usePDFJS: false,
      strict: false
    }
  }
});

// تنظیمات cornerstone WADO Image Loader
cornerstoneWADOImageLoader.configure({
  beforeSend: function(xhr) {
    // Add custom headers if needed
  },
  strict: false,
  useWebWorkers: true,
  decodeConfig: {
    convertFloatPixelDataToInt: false,
    use16BitDataType: true
  }
});

function StudyViewer() {
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
  const viewerRef = useRef(null);
  const elementRef = useRef(null);

  useEffect(() => {
    loadStudyData();
  }, [studyUid]);

useEffect(() => {
  let id;
  const tryEnable = () => {
    if (viewerRef.current && !elementRef.current) {
      try {
        cornerstone.enable(viewerRef.current);
        elementRef.current = viewerRef.current;
        clearInterval(id);
      } catch (e) {
        console.error('Error enabling cornerstone:', e);
      }
    }
  };
  id = setInterval(tryEnable, 100);
  return () => {
    clearInterval(id);
    if (elementRef.current) {
      try {
        cornerstone.disable(elementRef.current);
      } catch (e) {
        console.error('Error disabling cornerstone:', e);
      }
    }
  };
}, []);

  useEffect(() => {
    if (selectedSeries && instances.length > 0) {
      loadImage(currentIndex);
    }
  }, [selectedSeries, instances, currentIndex]);

  const loadStudyData = async () => {
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
  };

  const handleSeriesSelect = async (seriesUid) => {
    try {
      setImageLoading(true);
      const response = await pacsAPI.getSeriesInstances(seriesUid);
      setInstances(response.data);
      setSelectedSeries(seriesUid);
      setCurrentIndex(0);
    } catch (err) {
      console.error('Error loading series:', err);
      alert('Failed to load series images');
    } finally {
      setImageLoading(false);
    }
  };

  const loadImage = async (index) => {
    if (!elementRef.current || !instances[index]) return;

    try {
      setImageLoading(true);
      const instance = instances[index];
      const imageId = `wadouri:${pacsAPI.getInstanceFile(instance.sop_instance_uid)}`;
      
      console.log('Loading image:', imageId);
      
      // Ensure stack state exists and is populated before first display
      try {
        cornerstoneTools.addStackStateManager(elementRef.current, ['stack']);
        cornerstoneTools.addToolState(elementRef.current, 'stack', {
          imageIds: [imageId],
          currentImageIdIndex: 0
        });
      } catch (_) {}

      const image = await cornerstone.loadImage(imageId);
      
      // دیباگ اطلاعات تصویر
      console.log('Image loaded successfully:', {
        photometricInterpretation: image.photometricInterpretation,
        columns: image.columns,
        rows: image.rows,
        windowCenter: image.windowCenter,
        windowWidth: image.windowWidth,
        slope: image.slope,
        intercept: image.intercept
      });
      
      cornerstone.displayImage(elementRef.current, image);
      
      // تنظیم viewport با در نظر گرفتن Photometric Interpretation
      const viewport = cornerstone.getDefaultViewportForImage(elementRef.current, image);
      
      // اگر MONOCHROME1 بود، اینورت کن
      if (image.photometricInterpretation === "MONOCHROME1") {
        viewport.invert = true;
      }
      
      // اعمال Window/Level اگر وجود داشت، وگرنه از min/max استفاده کن
      if (image.windowCenter && image.windowWidth) {
        viewport.voi.windowCenter = image.windowCenter;
        viewport.voi.windowWidth = image.windowWidth;
      } else if (
        typeof image.minPixelValue === 'number' &&
        typeof image.maxPixelValue === 'number'
      ) {
        const ww = image.maxPixelValue - image.minPixelValue;
        const wc = image.minPixelValue + ww / 2;
        viewport.voi.windowCenter = wc;
        viewport.voi.windowWidth = Math.max(ww, 1);
      }
      
      cornerstone.setViewport(elementRef.current, viewport);
      
    } catch (err) {
      console.error('Error loading image:', err);
      alert('Failed to load image: ' + err.message);
    } finally {
      setImageLoading(false);
    }
  };

  const handlePrevImage = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const handleNextImage = () => {
    if (currentIndex < instances.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const handleZoomIn = () => {
    if (!elementRef.current) return;
    const viewport = cornerstone.getViewport(elementRef.current);
    viewport.scale += 0.1;
    cornerstone.setViewport(elementRef.current, viewport);
  };

  const handleZoomOut = () => {
    if (!elementRef.current) return;
    const viewport = cornerstone.getViewport(elementRef.current);
    viewport.scale -= 0.1;
    cornerstone.setViewport(elementRef.current, viewport);
  };

  const handleInvert = () => {
    if (!elementRef.current) return;
    const viewport = cornerstone.getViewport(elementRef.current);
    viewport.invert = !viewport.invert;
    cornerstone.setViewport(elementRef.current, viewport);
  };

  const handleReset = () => {
    if (!elementRef.current) return;
    cornerstone.reset(elementRef.current);
  };

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
    <div className="study-viewer-container">
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

        <div className="viewer-main">
          <div className="viewer-tools">
            <button onClick={handlePrevImage} disabled={currentIndex === 0}>
              ⬅️ Prev
            </button>
            <span className="image-counter">
              {currentIndex + 1} / {instances.length}
            </span>
            <button onClick={handleNextImage} disabled={currentIndex === instances.length - 1}>
              Next ➡️
            </button>
            <div className="tool-separator"></div>
            <button onClick={handleZoomIn}>🔍+ Zoom In</button>
            <button onClick={handleZoomOut}>🔍- Zoom Out</button>
            <button onClick={handleInvert}>⚫⚪ Invert</button>
            <button onClick={handleReset}>🔄 Reset</button>
          </div>

          <div className="viewer-canvas-container">
            {imageLoading && (
              <div className="image-loading-overlay">
                <div className="spinner"></div>
                <p>Loading image...</p>
              </div>
            )}
            <div
              ref={viewerRef}
              className="cornerstone-element"
              style={{ width: '100%', height: '100%', background: '#000' }}
            />
          </div>

          {instances.length > 0 && (
            <div className="image-info">
              <p>Instance: {instances[currentIndex]?.instance_number}</p>
              <p>SOP UID: {instances[currentIndex]?.sop_instance_uid}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default StudyViewer;

