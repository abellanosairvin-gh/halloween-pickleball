import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, RequireAuth } from './auth/Auth';
import { LoginPage } from './auth/LoginPage';
import { AppShell } from './components/AppShell';
import { ToastProvider } from './components/Toast';
import { EventDataProvider } from './data/EventData';
import { PlayersPage } from './pages/PlayersPage';
import { TeamsPage } from './pages/TeamsPage';
import { TournamentPage } from './pages/TournamentPage';

export function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            {/* /checkin is reserved for the public QR check-in page. */}
            <Route
              element={
                <RequireAuth>
                  <EventDataProvider>
                    <AppShell />
                  </EventDataProvider>
                </RequireAuth>
              }
            >
              <Route path="/players" element={<PlayersPage />} />
              <Route path="/teams" element={<TeamsPage />} />
              <Route path="/tournament" element={<TournamentPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/players" replace />} />
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
