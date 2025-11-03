import axios from 'axios';

const API_BASE_URL = 'http://localhost:8080/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const pacsAPI = {
  // Health check
  getHealth: () => api.get('/health'),

  // Statistics
  getStatistics: () => api.get('/statistics'),

  // Patients
  getPatients: (params = {}) => api.get('/patients', { params }),
  getPatient: (patientId) => api.get(`/patients/${patientId}`),
  getPatientStudies: (patientId) => api.get(`/patients/${patientId}/studies`),

  // Studies
  getStudies: (params = {}) => api.get('/studies', { params }),
  getStudy: (studyUid) => api.get(`/studies/${studyUid}`),
  getStudySeries: (studyUid) => api.get(`/studies/${studyUid}/series`),

  // Series
  getSeries: (seriesUid) => api.get(`/series/${seriesUid}`),
  getSeriesInstances: (seriesUid) => api.get(`/series/${seriesUid}/instances`),

  // Instances
  getInstance: (sopUid) => api.get(`/instances/${sopUid}`),
  getInstanceFile: (sopUid) => `${API_BASE_URL}/instances/${sopUid}/file`,
  downloadInstanceFile: (sopUid) => 
    api.get(`/instances/${sopUid}/file`, { responseType: 'blob' }),
    
 // Upload DICOM file
  uploadDicom: (formData) => {
    return axios.post(`${API_BASE_URL}/upload`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      },
      onUploadProgress: (progressEvent) => {
        const percentCompleted = Math.round(
          (progressEvent.loaded * 100) / progressEvent.total
        );
        console.log(`Upload progress: ${percentCompleted}%`);
      }
    });
  },

  // Alternative: Upload multiple files at once
  uploadMultipleDicom: (filesArray) => {
    const formData = new FormData();
    filesArray.forEach((file, index) => {
      formData.append(`files`, file);
    });
    
    return axios.post(`${API_BASE_URL}/upload/multiple`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });
  }
};

export default pacsAPI;
