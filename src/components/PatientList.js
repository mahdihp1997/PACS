import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { pacsAPI } from '../services/api';
import './PatientList.css';

function PatientList() {
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    loadPatients();
  }, []);

  const loadPatients = async () => {
    try {
      setLoading(true);
      const response = await pacsAPI.getPatients();
      setPatients(response.data);
      setError(null);
    } catch (err) {
      setError('Failed to load patients: ' + err.message);
      console.error('Error loading patients:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    try {
      setLoading(true);
      const response = await pacsAPI.getPatients({ 
        patientName: searchTerm 
      });
      setPatients(response.data);
      setError(null);
    } catch (err) {
      setError('Search failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePatientClick = (patientId) => {
    navigate(`/patient/${patientId}`);
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Loading patients...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-container">
        <h2>❌ Error</h2>
        <p>{error}</p>
        <button onClick={loadPatients}>Try Again</button>
      </div>
    );
  }

  return (
    <div className="patient-list-container">
      <div className="search-bar">
        <input
          type="text"
          placeholder="Search by patient name..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
        />
        <button onClick={handleSearch}>🔍 Search</button>
        <button onClick={loadPatients}>🔄 Refresh</button>
      </div>

      <div className="patients-grid">
        {patients.length === 0 ? (
          <div className="no-data">
            <p>No patients found</p>
          </div>
        ) : (
          patients.map((patient) => (
            <div
              key={patient.patient_id}
              className="patient-card"
              onClick={() => handlePatientClick(patient.patient_id)}
            >
              <div className="patient-icon">👤</div>
              <div className="patient-info">
                <h3>{patient.patient_name || 'Unknown'}</h3>
                <p><strong>ID:</strong> {patient.patient_id}</p>
                <p><strong>Birth Date:</strong> {patient.patient_birth_date || 'N/A'}</p>
                <p><strong>Sex:</strong> {patient.patient_sex || 'N/A'}</p>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="patient-count">
        Total: {patients.length} patient(s)
      </div>
    </div>
  );
}

export default PatientList;
