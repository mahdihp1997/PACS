import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { pacsAPI } from '../services/api';
import './AllStudies.css';

function AllStudies() {
  const navigate = useNavigate();
  const [studies, setStudies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({
    patientId: '',
    studyDate: '',
    modality: ''
  });

  useEffect(() => {
    loadStudies();
  }, []);

  const loadStudies = async () => {
    try {
      setLoading(true);
      const response = await pacsAPI.getStudies(filters);
      setStudies(response.data);
      setError(null);
    } catch (err) {
      setError('Failed to load studies: ' + err.message);
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    loadStudies();
  };

  const handleClearFilters = () => {
    setFilters({
      patientId: '',
      studyDate: '',
      modality: ''
    });
    setTimeout(() => loadStudies(), 100);
  };

  const handleStudyClick = (studyUid) => {
    navigate(`/study/${studyUid}`);
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Loading studies...</p>
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
    <div className="all-studies-container">
      <div className="page-header">
        <button className="back-button" onClick={() => navigate(-1)}>
          ← Back
        </button>
        <h1>🏥 All Studies</h1>
      </div>

      <div className="filters-section">
        <div className="filter-group">
          <label>Patient ID:</label>
          <input
            type="text"
            placeholder="Search by Patient ID..."
            value={filters.patientId}
            onChange={(e) => setFilters({...filters, patientId: e.target.value})}
            onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
          />
        </div>

        <div className="filter-group">
          <label>Study Date:</label>
          <input
            type="date"
            value={filters.studyDate}
            onChange={(e) => setFilters({...filters, studyDate: e.target.value})}
          />
        </div>

        <div className="filter-group">
          <label>Modality:</label>
          <select
            value={filters.modality}
            onChange={(e) => setFilters({...filters, modality: e.target.value})}
          >
            <option value="">All Modalities</option>
            <option value="CT">CT</option>
            <option value="MR">MR</option>
            <option value="US">US</option>
            <option value="XR">XR</option>
            <option value="CR">CR</option>
            <option value="DX">DX</option>
            <option value="MG">MG</option>
            <option value="NM">NM</option>
          </select>
        </div>

        <div className="filter-actions">
          <button onClick={handleSearch} className="search-btn">
            🔍 Search
          </button>
          <button onClick={handleClearFilters} className="clear-btn">
            🗑️ Clear
          </button>
          <button onClick={loadStudies} className="refresh-btn">
            🔄 Refresh
          </button>
        </div>
      </div>

      <div className="studies-list">
        {studies.length === 0 ? (
          <div className="no-data">
            <p>No studies found</p>
          </div>
        ) : (
          <div className="studies-grid">
            {studies.map((study) => (
              <div
                key={study.study_instance_uid}
                className="study-item"
                onClick={() => handleStudyClick(study.study_instance_uid)}
              >
                <div className="study-header">
                  <div className="study-icon">🏥</div>
                  <div className="study-title">
                    <h3>{study.study_description || 'Unnamed Study'}</h3>
                    <span className="study-date">{study.study_date || 'N/A'}</span>
                  </div>
                </div>
                
                <div className="study-details">
                  <div className="detail-row">
                    <span className="label">Patient ID:</span>
                    <span className="value">{study.patient_id || 'N/A'}</span>
                  </div>
                  <div className="detail-row">
                    <span className="label">Accession:</span>
                    <span className="value">{study.accession_number || 'N/A'}</span>
                  </div>
                  {study.referring_physician && (
                    <div className="detail-row">
                      <span className="label">Physician:</span>
                      <span className="value">{study.referring_physician}</span>
                    </div>
                  )}
                </div>

                <div className="study-footer">
                  <button className="view-btn">
                    📺 View Study
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="results-count">
        Total: {studies.length} study(ies)
      </div>
    </div>
  );
}

export default AllStudies;
