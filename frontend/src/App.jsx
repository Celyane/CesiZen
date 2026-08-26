import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';

import Navbar from './components/Navbar';
import PrivateRoute from './components/PrivateRoute';
import AdminRoute from './components/AdminRoute';

import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import Resources from './pages/Resources';
import ResourceDetail from './pages/ResourceDetail';
import ResourceForm from './pages/ResourceForm';
import BreathingExercices from './pages/BreathingExercices';
import BreathingExerciceDetail from './pages/BreathingExerciceDetail';
import BreathingExerciceForm from './pages/BreathingExerciceForm';
import AdminUsers from './pages/AdminUsers';
import AdminDashboard from './pages/AdminDashboard';
import AdminResources from './pages/AdminResources';
import AdminBreathingExercices from './pages/AdminBreathingExercices';
import Profile from './pages/Profile';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <div className="app-layout">
          <Navbar />
          <main className="app-main">
            <Routes>
              {/* Public routes */}
              <Route path="/" element={<Home />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/resources" element={<Resources />} />

              {/* Protected routes */}
              <Route
                path="/resources/new"
                element={
                  <PrivateRoute>
                    <ResourceForm />
                  </PrivateRoute>
                }
              />
              <Route
                path="/resources/:id/edit"
                element={
                  <PrivateRoute>
                    <ResourceForm />
                  </PrivateRoute>
                }
              />
              <Route path="/resources/:id" element={<ResourceDetail />} />

              <Route path="/breathing-exercices" element={<BreathingExercices />} />
              <Route
                path="/breathing-exercices/new"
                element={
                  <AdminRoute>
                    <BreathingExerciceForm />
                  </AdminRoute>
                }
              />
              <Route
                path="/breathing-exercices/:id/edit"
                element={
                  <AdminRoute>
                    <BreathingExerciceForm />
                  </AdminRoute>
                }
              />
              <Route path="/breathing-exercices/:id" element={<BreathingExerciceDetail />} />

              <Route
                path="/profile"
                element={
                  <PrivateRoute>
                    <Profile />
                  </PrivateRoute>
                }
              />

              <Route
                path="/admin"
                element={<AdminRoute><AdminDashboard /></AdminRoute>}
              />
              <Route
                path="/admin/users"
                element={<AdminRoute><AdminUsers /></AdminRoute>}
              />
              <Route
                path="/admin/resources"
                element={<AdminRoute><AdminResources /></AdminRoute>}
              />
              <Route
                path="/admin/breathing-exercices"
                element={<AdminRoute><AdminBreathingExercices /></AdminRoute>}
              />

              {/* 404 fallback */}
              <Route
                path="*"
                element={
                  <div className="page">
                    <h2>Page introuvable</h2>
                    <p>La page que vous recherchez n’existe pas.</p>
                  </div>
                }
              />
            </Routes>
          </main>
        </div>
      </AuthProvider>
    </BrowserRouter>
  );
}
