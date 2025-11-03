import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import PatientList from './components/PatientList';
import PatientDetails from './components/PatientDetails';
import AdvancedStudyViewer from './components/AdvancedStudyViewer';
import MultiViewLayout from './components/MultiViewLayout';
import Statistics from './components/Statistics';
import AllStudies from './components/AllStudies';  // جدید
import './App.css';

function App() {
  return (
    <Router>
      <div className="App">
        <header className="App-header">
          <div className="header-content">
            <h1>🏥 Davis PACS Viewer</h1>
            <nav className="nav-menu">
              <Link to="/" className="nav-link">Patients</Link>
              <Link to="/statistics" className="nav-link">Statistics</Link>
            </nav>
          </div>
        </header>

        <main className="App-main">
          <Routes>
            <Route path="/" element={<PatientList />} />
            <Route path="/patient/:patientId" element={<PatientDetails />} />
            <Route path="/study/:studyUid" element={<AdvancedStudyViewer />} />
            <Route path="/multiview/:studyUid" element={<MultiViewLayout />} />
            <Route path="/statistics" element={<Statistics />} />
            <Route path="/all-studies" element={<AllStudies />} />  {/* جدید */}
            <Route path="/all-series" element={<AllStudies />} />   {/* موقتاً همین */}
            <Route path="/all-instances" element={<AllStudies />} /> {/* موقتاً همین */}
            <Route path="/storage-details" element={<Statistics />} /> {/* موقتاً همین */}
            <Route path="/modalities" element={<AllStudies />} />    {/* موقتاً همین */}
          </Routes>
        </main>

        <footer className="App-footer">
          <p>Davis PACS System v1.0 - Medical Imaging Platform</p>
        </footer>
      </div>
    </Router>
  );
}

export default App;
