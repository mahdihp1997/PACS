import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { pacsAPI } from '../services/api';
import './Statistics.css';
import DicomUpload from './DicomUpload';

function Statistics() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [downloadSopUid, setDownloadSopUid] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState(null);

  useEffect(() => {
    loadStatistics();
  }, []);

  const loadStatistics = async () => {
    try {
      setLoading(true);
      
      const [statsRes, healthRes] = await Promise.all([
        pacsAPI.getStatistics(),
        pacsAPI.getHealth()
      ]);
      
      setStats(statsRes.data);
      setHealth(healthRes.data);
      setError(null);
    } catch (err) {
      setError('Failed to load statistics: ' + err.message);
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!downloadSopUid || downloading) return;
    setDownloading(true);
    setDownloadError(null);
    try {
      // Open in new tab to let browser handle save dialog
      const url = pacsAPI.getInstanceFile(downloadSopUid.trim());
      window.open(url, '_blank');
    } catch (e) {
      setDownloadError(e.message || 'Download failed');
    } finally {
      setDownloading(false);
    }
  };

  const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const handleCardClick = (type) => {
    // Navigate based on card type
    switch(type) {
      case 'patients':
        navigate('/');
        break;
      case 'studies':
        navigate('/all-studies');
        break;
      case 'series':
        navigate('/all-series');
        break;
      case 'instances':
        navigate('/all-instances');
        break;
      case 'storage':
        navigate('/storage-details');
        break;
      case 'modalities':
        navigate('/modalities');
        break;
      default:
        break;
    }
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Loading statistics...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-container">
        <h2>❌ Error</h2>
        <p>{error}</p>
        <button onClick={loadStatistics}>Try Again</button>
      </div>
    );
  }

  return (
    <div className="statistics-container">
      <h1>📊 System Statistics</h1>

      <div className="stats-grid">
        <div 
          className="stat-card patients clickable" 
          onClick={() => handleCardClick('patients')}
          title="Click to view all patients"
        >
          <div className="stat-icon">👥</div>
          <div className="stat-content">
            <h3>Patients</h3>
            <p className="stat-number">{stats?.totalPatients || 0}</p>
            <p className="stat-hint">Click to view →</p>
          </div>
        </div>

        <div 
          className="stat-card studies clickable" 
          onClick={() => handleCardClick('studies')}
          title="Click to view all studies"
        >
          <div className="stat-icon">🏥</div>
          <div className="stat-content">
            <h3>Studies</h3>
            <p className="stat-number">{stats?.totalStudies || 0}</p>
            <p className="stat-hint">Click to view →</p>
          </div>
        </div>

        <div 
          className="stat-card series clickable" 
          onClick={() => handleCardClick('series')}
          title="Click to view all series"
        >
          <div className="stat-icon">📚</div>
          <div className="stat-content">
            <h3>Series</h3>
            <p className="stat-number">{stats?.totalSeries || 0}</p>
            <p className="stat-hint">Click to view →</p>
          </div>
        </div>

        <div 
          className="stat-card instances clickable" 
          onClick={() => handleCardClick('instances')}
          title="Click to view all instances"
        >
          <div className="stat-icon">🖼️</div>
          <div className="stat-content">
            <h3>Images</h3>
            <p className="stat-number">{stats?.totalInstances || 0}</p>
            <p className="stat-hint">Click to view →</p>
          </div>
        </div>

        <div 
          className="stat-card storage clickable" 
          onClick={() => handleCardClick('storage')}
          title="Click to view storage details"
        >
          <div className="stat-icon">💾</div>
          <div className="stat-content">
            <h3>Storage Used</h3>
            <p className="stat-number">{formatBytes(stats?.totalStorageBytes)}</p>
            <p className="stat-hint">Click to view →</p>
          </div>
        </div>

        <div 
          className="stat-card modalities clickable" 
          onClick={() => handleCardClick('modalities')}
          title="Click to view modalities breakdown"
        >
          <div className="stat-icon">📡</div>
          <div className="stat-content">
            <h3>Modalities</h3>
            <p className="stat-number">{stats?.uniqueModalities || 0}</p>
            <p className="stat-hint">Click to view →</p>
          </div>
        </div>
      </div>

      <div className="system-health">
        <h2>🔧 System Health</h2>
        <div className="health-grid">
          <div className="health-item">
            <span className="health-label">API Status:</span>
            <span className={`health-status ${health?.status === 'UP' ? 'up' : 'down'}`}>
              {health?.status === 'UP' ? '✅ UP' : '❌ DOWN'}
            </span>
          </div>
          <div className="health-item">
            <span className="health-label">Database:</span>
            <span className={`health-status ${health?.database === 'UP' ? 'up' : 'down'}`}>
              {health?.database === 'UP' ? '✅ UP' : '❌ DOWN'}
            </span>
          </div>
          <div className="health-item">
            <span className="health-label">Last Check:</span>
            <span className="health-value">
              {health?.timestamp ? new Date(health.timestamp).toLocaleString() : 'N/A'}
            </span>
          </div>
        </div>
      </div>

      <div className="download-panel">
        <h2>⬇️ Manual DICOM Download</h2>
        <div className="download-row">
          <input
            type="text"
            className="download-input"
            placeholder="Enter SOP Instance UID"
            value={downloadSopUid}
            onChange={(e) => setDownloadSopUid(e.target.value)}
          />
          <button
            className="download-button"
            onClick={handleDownload}
            disabled={!downloadSopUid || downloading}
            title="Open DICOM file in a new tab"
          >
            {downloading ? 'Downloading...' : 'Download'}
          </button>
        </div>
        {downloadError && (
          <p className="download-error">{downloadError}</p>
        )}
        <p className="download-hint">Paste a SOP Instance UID to fetch its DICOM file directly.</p>
      </div>

      <div className="upload-section">
        <h2>📤 Upload DICOM Files</h2>
        <DicomUpload onUploadComplete={loadStatistics} />
      </div>

      <button className="refresh-button" onClick={loadStatistics}>
        🔄 Refresh Statistics
      </button>
    </div>
  );
}

export default Statistics;

