import { Link, NavLink, Navigate, Route, Routes } from 'react-router-dom';
import HealthIndicator from './components/HealthIndicator.jsx';
import MeasurementsPage from './pages/MeasurementsPage.jsx';
import StationDetailsPage from './pages/StationDetailsPage.jsx';
import StationsPage from './pages/StationsPage.jsx';

function NotFound() {
  return (
    <div className="card">
      <h1>Сторінку не знайдено</h1>
      <Link to="/stations">До списку станцій</Link>
    </div>
  );
}

// Каркас SPA: шапка з навігацією і маршрути сторінок
function App() {
  return (
    <div className="layout">
      <header className="header">
        <div className="header-inner">
          <Link to="/" className="logo">
            <span className="logo-mark" aria-hidden="true">
              ◎
            </span>
            Якість повітря
          </Link>
          <nav className="nav">
            <NavLink to="/stations">Станції</NavLink>
            <NavLink to="/measurements">Вимірювання</NavLink>
          </nav>
          <HealthIndicator />
        </div>
      </header>

      <main className="main">
        <Routes>
          <Route path="/" element={<Navigate to="/stations" replace />} />
          <Route path="/stations" element={<StationsPage />} />
          <Route path="/stations/:code" element={<StationDetailsPage />} />
          <Route path="/measurements" element={<MeasurementsPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
