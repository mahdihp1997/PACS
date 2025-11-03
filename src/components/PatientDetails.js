import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { pacsAPI } from '../services/api';
import './PatientDetails.css';

function PatientDetails() {
  const { patientId } = useParams();
  const navigate = useNavigate();
  const [patient, setPatient] = useState(null);
  const [studies, setStudies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadPatientData();
  }, [patientId]);

  const loadPatientData = async () => {
    try {
      setLoading(true);
      
	const [patientRes, studiesRes] = await Promise.all([
	  pacsAPI.getPatient(patientId),
	  pacsAPI.getPatientStudies(patientId)
	]);
	console.log('📦 studies data:', studiesRes.data);

      
      setPatient(patientRes.data);
      setStudies(studiesRes.data);
      setError(null);
    } catch (err) {
      setError('Failed to load patient data: ' + err.message);
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleStudyClick = (studyUid) => {
    navigate(`/study/${studyUid}`);
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Loading patient data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-container">
        <h2>❌ Error</h2>
        <p>{error}</p>
        <button onClick={() => navigate('/')}>Back to Patients</button>
      </div>
    );
  }

  return (
    <div className="patient-details-container">
      <button className="back-button" onClick={() => navigate('/')}>
        ← Back to Patients
      </button>

      <div className="patient-header">
        <div className="patient-avatar">👤</div>
        <div className="patient-info-detailed">
          <h1>{patient?.patient_name || 'Unknown Patient'}</h1>
          <div className="info-grid">
            <div className="info-item">
              <span className="label">Patient ID:</span>
              <span className="value">{patient?.patient_id}</span>
            </div>
            <div className="info-item">
              <span className="label">Birth Date:</span>
              <span className="value">{patient?.patient_birth_date || 'N/A'}</span>
            </div>
            <div className="info-item">
              <span className="label">Sex:</span>
              <span className="value">{patient?.patient_sex || 'N/A'}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="studies-section">
        <h2>📚 Studies ({studies.length})</h2>
        
        {studies.length === 0 ? (
          <div className="no-data">
            <p>No studies found for this patient</p>
          </div>
        ) : (
          <div className="studies-grid">
            {studies.map((study) => (
              <div
		  key={study.study_instance_uid}
		  className="study-card"
		>
		  <div className="study-icon">🏥</div>
		  <div className="study-info">
		    <h3>{study.study_description || 'Unnamed Study'}</h3>
		    <p><strong>Date:</strong> {study.study_date || 'N/A'}</p>
		    <p><strong>Time:</strong> {study.study_time || 'N/A'}</p>
		    <p><strong>Accession:</strong> {study.accession_number || 'N/A'}</p>
		  </div>
		  <div className="study-actions">
		    <button
		      onClick={(e) => {
			e.stopPropagation();
			navigate(`/study/${study.study_instance_uid}`);
		      }}
		      className="action-button"
		    >
		      📺 Single View
		    </button>
		    <button
		      onClick={(e) => {
			e.stopPropagation();
			navigate(`/multiview/${study.study_instance_uid}`);
		      }}
		      className="action-button primary"
		    >
		      🖼️ Multi-View
		    </button>
		  </div>
                <div className="study-arrow">→</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default PatientDetails;
