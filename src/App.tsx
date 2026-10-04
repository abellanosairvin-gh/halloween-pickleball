import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { OrganizerAccess, PARTY_PATHS, PartyAccess } from './auth/Access';
import { AuthProvider, RequireAuth } from './auth/Auth';
import { LoginPage } from './auth/LoginPage';
import { AppShell } from './components/AppShell';
import { PartyShell } from './components/PartyShell';
import { ToastProvider } from './components/Toast';
import { EventDataProvider } from './data/EventData';
import { PlayersPage } from './pages/PlayersPage';
import { QrPosterPage } from './pages/QrPosterPage';
import { TeamsPage } from './pages/TeamsPage';
import { TournamentPage } from './pages/TournamentPage';

export function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />

            {/* Public party page, reached from the QR code. No sign-in. */}
            <Route
              path="/party"
              element={
                <PartyAccess>
                  <EventDataProvider>
                    <PartyShell />
                  </EventDataProvider>
                </PartyAccess>
              }
            >
              <Route index element={<Navigate to={PARTY_PATHS.players} replace />} />
              <Route path="checkin" element={<PlayersPage />} />
              <Route path="teams" element={<TeamsPage />} />
              <Route path="tournament" element={<TournamentPage />} />
            </Route>

            <Route
              path="/qr"
              element={
                <RequireAuth>
                  <QrPosterPage />
                </RequireAuth>
              }
            />

            <Route
              element={
                <RequireAuth>
                  <OrganizerAccess>
                    <EventDataProvider>
                      <AppShell />
                    </EventDataProvider>
                  </OrganizerAccess>
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
