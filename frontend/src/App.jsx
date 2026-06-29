import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Upload from './pages/Upload';
import MonthlyView from './pages/MonthlyView';
import TemplateEditor from './pages/TemplateEditor';

const ProtectedRoute = ({ children, isAuthenticated }) => {
  return isAuthenticated ? children : <Navigate to="/login" />;
};

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    setIsAuthenticated(!!token);
    setLoading(false);
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center h-screen">Chargement...</div>;
  }

  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login setIsAuthenticated={setIsAuthenticated} />} />
        <Route path="/dashboard" element={<ProtectedRoute isAuthenticated={isAuthenticated}><Dashboard /></ProtectedRoute>} />
        <Route path="/upload" element={<ProtectedRoute isAuthenticated={isAuthenticated}><Upload /></ProtectedRoute>} />
        <Route path="/monthly/client/:clientId" element={<ProtectedRoute isAuthenticated={isAuthenticated}><MonthlyView /></ProtectedRoute>} />
        <Route path="/monthly/:balanceId" element={<ProtectedRoute isAuthenticated={isAuthenticated}><MonthlyView /></ProtectedRoute>} />
        <Route path="/templates/new" element={<ProtectedRoute isAuthenticated={isAuthenticated}><TemplateEditor /></ProtectedRoute>} />
        <Route path="/templates/edit/:templateId" element={<ProtectedRoute isAuthenticated={isAuthenticated}><TemplateEditor /></ProtectedRoute>} />
        <Route path="/" element={<Navigate to="/dashboard" />} />
      </Routes>
    </Router>
  );
}

export default App;
