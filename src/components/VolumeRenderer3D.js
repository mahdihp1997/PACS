import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import * as cornerstone from 'cornerstone-core';
import { pacsAPI } from '../services/api';

/**
 * VolumeRenderer3D - کامپوننت رندر سه‌بعدی حجمی از تصاویر DICOM
 * 
 * این کامپوننت یک stack از تصاویر DICOM رو می‌گیره و به صورت 3D volume render می‌کنه
 * از Three.js برای rendering استفاده می‌کنه
 */
function VolumeRenderer3D({ instances, onClose, studyUid }) {
  const containerRef = useRef(null);
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const volumeRef = useRef(null);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [renderingMode, setRenderingMode] = useState('mip'); // 'mip', 'average', 'raycast'
  const [opacity, setOpacity] = useState(0.5);
  const [threshold, setThreshold] = useState(0.1);
  
  // Load volume data from DICOM instances
  useEffect(() => {
    if (!instances || instances.length === 0) {
      setError('No instances provided');
      setLoading(false);
      return;
    }

    loadVolumeData(instances).then(() => {
      setLoading(false);
    }).catch(err => {
      console.error('Error loading volume:', err);
      setError('Failed to load volume data');
      setLoading(false);
    });
  }, [instances]);

  // Initialize Three.js scene
  useEffect(() => {
    if (!containerRef.current || loading) return;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);

    // Camera
    const camera = new THREE.PerspectiveCamera(
      75,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.1,
      1000
    );
    camera.position.set(0, 0, 5);

    // Renderer
    const renderer = new THREE.WebGLRenderer({ 
      antialias: true,
      alpha: true 
    });
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    containerRef.current.appendChild(renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 5, 5);
    scene.add(directionalLight);

    // Controls (simple mouse controls)
    let isDragging = false;
    let previousMousePosition = { x: 0, y: 0 };

    const onMouseDown = (e) => {
      isDragging = true;
      previousMousePosition = { x: e.clientX, y: e.clientY };
    };

    const onMouseMove = (e) => {
      if (!isDragging) return;
      
      const deltaX = e.clientX - previousMousePosition.x;
      const deltaY = e.clientY - previousMousePosition.y;
      
      // Rotate camera
      const spherical = new THREE.Spherical();
      spherical.setFromVector3(camera.position);
      spherical.theta -= deltaX * 0.01;
      spherical.phi += deltaY * 0.01;
      spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, spherical.phi));
      
      camera.position.setFromSpherical(spherical);
      camera.lookAt(0, 0, 0);
      
      previousMousePosition = { x: e.clientX, y: e.clientY };
    };

    const onMouseUp = () => {
      isDragging = false;
    };

    const onWheel = (e) => {
      e.preventDefault();
      const scale = e.deltaY > 0 ? 1.1 : 0.9;
      camera.position.multiplyScalar(scale);
    };

    renderer.domElement.addEventListener('mousedown', onMouseDown);
    renderer.domElement.addEventListener('mousemove', onMouseMove);
    renderer.domElement.addEventListener('mouseup', onMouseUp);
    renderer.domElement.addEventListener('wheel', onWheel);

    sceneRef.current = scene;
    rendererRef.current = renderer;
    cameraRef.current = camera;

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
    };
    animate();

    // Handle resize
    const handleResize = () => {
      if (!containerRef.current || !camera || !renderer) return;
      camera.aspect = containerRef.current.clientWidth / containerRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('mousedown', onMouseDown);
      renderer.domElement.removeEventListener('mousemove', onMouseMove);
      renderer.domElement.removeEventListener('mouseup', onMouseUp);
      renderer.domElement.removeEventListener('wheel', onWheel);
      
      if (rendererRef.current) {
        rendererRef.current.dispose();
        containerRef.current?.removeChild(rendererRef.current.domElement);
      }
    };
  }, [loading]);

  // Load volume data from DICOM instances
  const loadVolumeData = async (instanceList) => {
    try {
      console.log(`Loading ${instanceList.length} instances for 3D volume...`);
      
      // Sort instances by instance number
      const sortedInstances = [...instanceList].sort((a, b) => 
        parseInt(a.instance_number || 0) - parseInt(b.instance_number || 0)
      );

      // Get dimensions from first image
      const firstInstance = sortedInstances[0];
      const firstImageId = `wadouri:${pacsAPI.getInstanceFile(firstInstance.sop_instance_uid)}`;
      const firstImage = await cornerstone.loadImage(firstImageId);

      const width = firstImage.columns || 256;
      const height = firstImage.rows || 256;
      const depth = sortedInstances.length;

      console.log(`Volume dimensions: ${width}x${height}x${depth}`);

      // Create 3D texture data
      const volumeData = new Uint16Array(width * height * depth);
      let loadedCount = 0;

      // Load all images in parallel (limited concurrency)
      const concurrency = 5;
      for (let i = 0; i < sortedInstances.length; i += concurrency) {
        const batch = sortedInstances.slice(i, i + concurrency);
        await Promise.all(batch.map(async (instance, batchIdx) => {
          try {
            const imageId = `wadouri:${pacsAPI.getInstanceFile(instance.sop_instance_uid)}`;
            const image = await cornerstone.loadImage(imageId);
            
            let pixelData;
            if (image.getPixelData) {
              pixelData = image.getPixelData();
            } else if (image.pixelData) {
              pixelData = image.pixelData;
            } else {
              console.warn(`Cannot get pixel data for instance ${instance.sop_instance_uid}`);
              return;
            }

            const sliceIndex = i + batchIdx;
            const offset = sliceIndex * width * height;
            
            // Copy pixel data to volume
            for (let j = 0; j < Math.min(pixelData.length, width * height); j++) {
              volumeData[offset + j] = pixelData[j];
            }
            
            loadedCount++;
            if (loadedCount % 10 === 0) {
              console.log(`Loaded ${loadedCount}/${depth} slices...`);
            }
          } catch (err) {
            console.error(`Error loading instance ${instance.sop_instance_uid}:`, err);
          }
        }));
      }

      console.log(`Volume data loaded: ${loadedCount} slices`);

      // Create simple visualization (3D texture not always available in all Three.js versions)
      // Instead, we'll use a stack of 2D slices or point cloud
      const volumeTexture = null; // Will be used for advanced rendering

      // Create volume geometry and material (defer until scene is ready)
      // Will be called in useEffect when scene is initialized

      volumeRef.current = { texture: volumeTexture, dimensions: { width, height, depth }, data: volumeData };

    } catch (err) {
      console.error('Error loading volume data:', err);
      throw err;
    }
  };

  // Create volume visualization
  const createVolumeVisualization = (scene, texture, dimensions, volumeData) => {
    if (!scene || !dimensions || !volumeData) return;
    
    // Clear existing visualization
    const toRemove = [];
    scene.children.forEach(child => {
      if (child.userData?.isVolume) {
        toRemove.push(child);
      }
    });
    toRemove.forEach(child => scene.remove(child));

    const { width, height, depth } = dimensions;
    const maxDim = Math.max(width, height, depth);
    const scale = 2 / maxDim;
    
    // Method 1: Stack of 2D slices (simplest)
    if (renderingMode === 'mip' || renderingMode === 'average') {
      const sliceCount = Math.min(depth, 30); // Limit for performance
      const step = Math.floor(depth / sliceCount);
      
      for (let i = 0; i < sliceCount; i++) {
        const sliceIdx = i * step;
        if (sliceIdx >= depth) break;
        
        const offset = sliceIdx * width * height;
        const sliceData = volumeData.slice(offset, offset + width * height);
        
        // Find max/average value for this slice
        let maxValue = 0;
        let sum = 0;
        for (let j = 0; j < sliceData.length; j++) {
          const val = sliceData[j];
          if (val > maxValue) maxValue = val;
          sum += val;
        }
        const avgValue = sum / sliceData.length;
        const displayValue = renderingMode === 'mip' ? maxValue : avgValue;
        
        // Normalize to 0-255
        const normalized = Math.floor((displayValue / 65535) * 255);
        
        // Create plane
        const geometry = new THREE.PlaneGeometry(width * scale, height * scale);
        const material = new THREE.MeshBasicMaterial({
          color: new THREE.Color(normalized / 255, normalized / 255, normalized / 255),
          transparent: true,
          opacity: opacity * (1 / sliceCount),
          side: THREE.DoubleSide
        });
        
        const plane = new THREE.Mesh(geometry, material);
        plane.position.z = ((i / sliceCount) - 0.5) * 2;
        plane.userData.isVolume = true;
        scene.add(plane);
      }
    } else {
      // Point cloud for raycast mode (simplified)
      const pointCount = Math.min(width * height * depth, 10000);
      const points = new Float32Array(pointCount * 3);
      const colors = new Float32Array(pointCount * 3);
      
      let pointIdx = 0;
      const step = Math.floor((width * height * depth) / pointCount);
      
      for (let i = 0; i < width * height * depth && pointIdx < pointCount; i += step) {
        const z = Math.floor(i / (width * height));
        const y = Math.floor((i % (width * height)) / width);
        const x = i % width;
        
        const value = volumeData[i];
        if (value < threshold * 65535) continue; // Threshold filtering
        
        points[pointIdx * 3] = (x / width - 0.5) * 2 * scale;
        points[pointIdx * 3 + 1] = (y / height - 0.5) * 2 * scale;
        points[pointIdx * 3 + 2] = (z / depth - 0.5) * 2 * scale;
        
        const normalized = value / 65535;
        colors[pointIdx * 3] = normalized;
        colors[pointIdx * 3 + 1] = normalized;
        colors[pointIdx * 3 + 2] = normalized;
        
        pointIdx++;
      }
      
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(points, 3));
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      
      const material = new THREE.PointsMaterial({
        size: 0.01,
        vertexColors: true,
        transparent: true,
        opacity: opacity
      });
      
      const pointsMesh = new THREE.Points(geometry, material);
      pointsMesh.userData.isVolume = true;
      scene.add(pointsMesh);
    }
  };

  // Create visualization when volume data is loaded
  useEffect(() => {
    if (!volumeRef.current || !sceneRef.current || loading) return;
    
    createVolumeVisualization(
      sceneRef.current,
      volumeRef.current.texture,
      volumeRef.current.dimensions,
      volumeRef.current.data
    );
  }, [loading]);

  // Update rendering when parameters change
  useEffect(() => {
    if (!volumeRef.current || !sceneRef.current || loading) return;
    
    // Recreate with new parameters
    if (volumeRef.current && volumeRef.current.data) {
      createVolumeVisualization(
        sceneRef.current,
        volumeRef.current.texture,
        volumeRef.current.dimensions,
        volumeRef.current.data
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderingMode, opacity, threshold]);

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
        <p>Loading 3D Volume...</p>
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

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', background: '#000' }}>
      {/* Controls Panel */}
      <div style={{
        position: 'absolute',
        top: '10px',
        left: '10px',
        background: 'rgba(45, 55, 72, 0.9)',
        padding: '1rem',
        borderRadius: '8px',
        zIndex: 100,
        color: 'white',
        minWidth: '200px'
      }}>
        <h4 style={{ margin: '0 0 1rem 0', fontSize: '1rem' }}>3D Volume Controls</h4>
        
        <div style={{ marginBottom: '0.75rem' }}>
          <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem' }}>
            Rendering Mode:
          </label>
          <select
            value={renderingMode}
            onChange={(e) => setRenderingMode(e.target.value)}
            style={{
              width: '100%',
              padding: '0.4rem',
              background: '#1a202c',
              color: 'white',
              border: '1px solid #4a5568',
              borderRadius: '4px'
            }}
          >
            <option value="mip">Maximum Intensity Projection (MIP)</option>
            <option value="average">Average Intensity</option>
            <option value="raycast">Ray Casting</option>
          </select>
        </div>

        <div style={{ marginBottom: '0.75rem' }}>
          <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem' }}>
            Opacity: {opacity.toFixed(2)}
          </label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={opacity}
            onChange={(e) => setOpacity(parseFloat(e.target.value))}
            style={{ width: '100%' }}
          />
        </div>

        <div style={{ marginBottom: '0.75rem' }}>
          <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem' }}>
            Threshold: {threshold.toFixed(2)}
          </label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={threshold}
            onChange={(e) => setThreshold(parseFloat(e.target.value))}
            style={{ width: '100%' }}
          />
        </div>

        <button
          onClick={onClose}
          style={{
            width: '100%',
            padding: '0.5rem',
            background: '#4a5568',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            marginTop: '0.5rem'
          }}
        >
          Close 3D View
        </button>
      </div>

      {/* Info */}
      <div style={{
        position: 'absolute',
        bottom: '10px',
        left: '10px',
        background: 'rgba(0, 0, 0, 0.7)',
        padding: '0.5rem 1rem',
        borderRadius: '5px',
        color: 'white',
        fontSize: '0.85rem',
        zIndex: 100
      }}>
        <div>Instances: {instances?.length || 0}</div>
        <div style={{ fontSize: '0.75rem', color: '#a0aec0', marginTop: '0.25rem' }}>
          Drag to rotate • Scroll to zoom
        </div>
      </div>

      {/* Canvas Container */}
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}

export default VolumeRenderer3D;


