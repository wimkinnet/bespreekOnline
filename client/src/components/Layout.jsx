import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  // Close the mobile menu whenever the route changes
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div className={'app-shell' + (menuOpen ? ' menu-open' : '')}>
      <header className="mobile-topbar">
        <button
          className="menu-toggle"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span />
          <span />
          <span />
        </button>
        <div className="brand">
          <img className="brand-logo" src="/logo.png" alt="" />
          bespreek
        </div>
      </header>

      <div className="sidebar-backdrop" onClick={() => setMenuOpen(false)} />

      <aside className="sidebar">
        <div className="brand">
          <div className="brand-name">
            <img className="brand-logo" src="/logo.png" alt="" />
            bespreek
          </div>
          <span>School &amp; Scholen Groep advies</span>
        </div>

        <nav>
          <NavLink to="/" end className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
            Dashboard
          </NavLink>
          <NavLink to="/clients" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
            Clients
          </NavLink>
          <NavLink to="/assignments" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
            Assignments
          </NavLink>
          <NavLink to="/time" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
            Time registration
          </NavLink>
          <NavLink to="/calendar" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
            Calendar
          </NavLink>
          {user?.role === 'admin' && (
            <>
              <NavLink to="/reports" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
                Reports
              </NavLink>
              <NavLink to="/consultants" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
                Consultants
              </NavLink>
            </>
          )}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            {user?.name}
            <small>{user?.role === 'admin' ? 'Admin' : 'Consultant'}</small>
          </div>
          <button className="logout-btn" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </aside>

      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
