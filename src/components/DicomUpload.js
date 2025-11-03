import React, { useState, useRef } from 'react';
import { pacsAPI } from '../services/api';
import './DicomUpload.css';

function DicomUpload({ onUploadComplete }) {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState(null);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef(null);

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    validateAndSetFiles(files);
  };

  const validateAndSetFiles = (files) => {
    // Filter DICOM files (.dcm or files without extension)
    const dicomFiles = files.filter(file => {
      const extension = file.name.split('.').pop().toLowerCase();
      return extension === 'dcm' || !file.name.includes('.');
    });

    if (dicomFiles.length === 0) {
      setUploadStatus({
        type: 'error',
        message: 'Please select valid DICOM files (.dcm)'
      });
      return;
    }

    setSelectedFiles(dicomFiles);
    setUploadStatus(null);
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files);
      validateAndSetFiles(files);
    }
  };

  const uploadFiles = async () => {
    if (selectedFiles.length === 0) return;

    setUploading(true);
    setUploadProgress(0);
    setUploadStatus(null);

    const totalFiles = selectedFiles.length;
    let successCount = 0;
    let failCount = 0;
    const errors = [];

    try {
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        const formData = new FormData();
        formData.append('file', file);

        try {
          // Upload to PACS server
          await pacsAPI.uploadDicom(formData);
          successCount++;
          
          // Update progress
          setUploadProgress(Math.round(((i + 1) / totalFiles) * 100));
        } catch (err) {
          failCount++;
          errors.push({
            filename: file.name,
            error: err.response?.data?.detail || err.message
          });
          console.error(`Failed to upload ${file.name}:`, err);
        }
      }

      // Show final status
      if (failCount === 0) {
        setUploadStatus({
          type: 'success',
          message: `Successfully uploaded ${successCount} file(s)! 🎉`
        });
        
        // Clear selected files
        setTimeout(() => {
          setSelectedFiles([]);
          setUploadProgress(0);
          if (onUploadComplete) onUploadComplete();
        }, 2000);
      } else {
        setUploadStatus({
          type: 'warning',
          message: `Uploaded ${successCount} file(s). Failed: ${failCount} file(s)`,
          errors: errors
        });
      }
    } catch (err) {
      setUploadStatus({
        type: 'error',
        message: 'Upload failed: ' + err.message
      });
    } finally {
      setUploading(false);
    }
  };

  const clearFiles = () => {
    setSelectedFiles([]);
    setUploadStatus(null);
    setUploadProgress(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <div className="dicom-upload-container">
      <div className="upload-header">
        <h3>📤 Upload DICOM Files</h3>
        <p className="upload-description">
          Upload DICOM images to the PACS server
        </p>
      </div>

      {/* Drag & Drop Zone */}
      <div
        className={`drop-zone ${dragActive ? 'active' : ''} ${selectedFiles.length > 0 ? 'has-files' : ''}`}
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".dcm,application/dicom"
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />

        {selectedFiles.length === 0 ? (
          <div className="drop-zone-content">
            <div className="drop-icon">📁</div>
            <p className="drop-text">
              Drag & Drop DICOM files here
            </p>
            <p className="drop-subtext">or</p>
            <button className="browse-button" type="button">
              Browse Files
            </button>
            <p className="drop-hint">
              Supported: .dcm files
            </p>
          </div>
        ) : (
          <div className="files-list">
            <div className="files-header">
              <span className="files-count">
                {selectedFiles.length} file(s) selected
              </span>
              <button 
                className="clear-button" 
                onClick={(e) => {
                  e.stopPropagation();
                  clearFiles();
                }}
                disabled={uploading}
              >
                ✕ Clear
              </button>
            </div>
            <div className="files-scroll">
              {selectedFiles.map((file, idx) => (
                <div key={idx} className="file-item">
                  <span className="file-icon">📄</span>
                  <div className="file-info">
                    <span className="file-name">{file.name}</span>
                    <span className="file-size">{formatFileSize(file.size)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Upload Progress */}
      {uploading && (
        <div className="upload-progress">
          <div className="progress-bar">
            <div 
              className="progress-fill" 
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
          <span className="progress-text">{uploadProgress}%</span>
        </div>
      )}

      {/* Status Messages */}
      {uploadStatus && (
        <div className={`upload-status ${uploadStatus.type}`}>
          <span className="status-icon">
            {uploadStatus.type === 'success' && '✓'}
            {uploadStatus.type === 'error' && '✗'}
            {uploadStatus.type === 'warning' && '⚠'}
          </span>
          <div className="status-content">
            <p className="status-message">{uploadStatus.message}</p>
            {uploadStatus.errors && uploadStatus.errors.length > 0 && (
              <div className="status-errors">
                <p className="errors-title">Failed files:</p>
                {uploadStatus.errors.map((err, idx) => (
                  <p key={idx} className="error-item">
                    • {err.filename}: {err.error}
                  </p>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Upload Button */}
      {selectedFiles.length > 0 && (
        <div className="upload-actions">
          <button
            className="upload-button"
            onClick={uploadFiles}
            disabled={uploading}
          >
            {uploading ? (
              <>
                <span className="spinner-small"></span>
                Uploading...
              </>
            ) : (
              <>
                📤 Upload {selectedFiles.length} File(s)
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

export default DicomUpload;
