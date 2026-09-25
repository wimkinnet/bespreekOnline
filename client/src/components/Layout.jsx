import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          Consult CRM
          <span>School &amp; school-pool advisory</span>
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
