import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate, useLocation } from 'react-router-dom';
import { 
  Settings, LayoutDashboard, LogOut, Menu, X,
  Image as ImageIcon, School, 
  History, Users2, FileText, 
  UserCircle, Building2, BookOpen
} from 'lucide-react';

// Import Professional Page Components
import Banners from './pages/Banners';
import Universities from './pages/Universities';
import Scholarships from './pages/Scholarships';
import UsersList from './pages/Users';
import SettingsPage from './pages/Settings';
import UniHistory from './pages/UniHistory';
import ScholarHistory from './pages/ScholarHistory';
import Applicants from './pages/Applicants';
import AdminApplications from './pages/AdminApplications';
import Accounts from './pages/Accounts';
import AdminDashboard from './pages/AdminDashboard'; // Integrated Overview Page
import Login from './pages/Login'; // Unified Login Page
import { fetchProfile } from './api';

const parseStoredAdmin = () => {
  try {
    const raw =
      localStorage.getItem('admin') || sessionStorage.getItem('admin') || '{}';
    return JSON.parse(raw);
  } catch {
    return {};
  }
};

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [admin, setAdmin] = useState({});
  const [authChecking, setAuthChecking] = useState(true);

  const clearSession = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('admin');
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('admin');
  };

  const handleLogout = () => {
    clearSession();
    setIsAuthenticated(false);
    setAdmin({});
    setAuthChecking(false);
  };

  useEffect(() => {
    let isMounted = true;

    const verifySession = async () => {
      const token =
        localStorage.getItem('token') || sessionStorage.getItem('token');
      const storedAdmin =
        localStorage.getItem('admin') || sessionStorage.getItem('admin');

      if (!token || !storedAdmin) {
        if (!isMounted) return;
        setIsAuthenticated(false);
        setAdmin({});
        setAuthChecking(false);
        return;
      }

      try {
        const res = await fetchProfile();
        const profile = res?.data || parseStoredAdmin();
        if (!profile || profile.role === 'user') {
          throw new Error('Unauthorized role');
        }

        if (!isMounted) return;
        setAdmin(profile);
        setIsAuthenticated(true);

        if (localStorage.getItem('token')) {
          localStorage.setItem('admin', JSON.stringify(profile));
        }
        if (sessionStorage.getItem('token')) {
          sessionStorage.setItem('admin', JSON.stringify(profile));
        }
      } catch {
        if (!isMounted) return;
        clearSession();
        setIsAuthenticated(false);
        setAdmin({});
      } finally {
        if (isMounted) setAuthChecking(false);
      }
    };

    verifySession();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <Router>
      {authChecking ? (
        <AuthLoadingScreen />
      ) : !isAuthenticated ? (
        <Login setAuth={setIsAuthenticated} setAdmin={setAdmin} />
      ) : (
        <AdminLayout admin={admin} onLogout={handleLogout} />
      )}
    </Router>
  );
}

function AuthLoadingScreen() {
  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
      <div className="bg-white border border-slate-200 rounded-2xl px-6 py-5 shadow-sm text-center">
        <div className="w-8 h-8 mx-auto rounded-full border-2 border-slate-200 border-t-teal-500 animate-spin" />
        <p className="mt-3 text-sm font-semibold text-slate-600">
          Verifying session...
        </p>
      </div>
    </div>
  );
}

function AdminLayout({ admin, onLogout }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  return (
    <div className="admin-shell flex min-h-screen bg-slate-100 font-sans">
      {sidebarOpen && (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-slate-900/55 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close menu overlay"
        />
      )}

      <aside
        className={`w-72 bg-[#0F172A] text-white shadow-2xl flex flex-col fixed h-full z-40 transition-transform duration-300 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="p-6 pb-5 text-2xl font-black border-b border-white/5 flex items-center gap-3">
          <div className="w-10 h-10 bg-teal-500 rounded-xl flex items-center justify-center shadow-lg shadow-teal-500/20">
            <School className="text-white" size={24} />
          </div>
          <span className="tracking-tight">SINDH ADMIN</span>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="ml-auto rounded-xl p-2 text-gray-300 hover:bg-white/10 lg:hidden"
            aria-label="Close sidebar"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="mt-6 flex-1 space-y-1.5 px-5 pb-8 overflow-y-auto custom-scrollbar">
          <div className="text-[10px] font-black text-gray-500 uppercase tracking-widest pl-3 mb-2">Main Dashboard</div>
          <SidebarLink to="/" icon={<LayoutDashboard size={20} />} label="Overview" onNavigate={() => setSidebarOpen(false)} />

          {admin?.role === 'admin' && (
            <>
              <div className="text-[10px] font-black text-gray-500 uppercase tracking-widest pl-3 mt-7 mb-2">App Content</div>
              <SidebarLink to="/banners" icon={<ImageIcon size={20} />} label="Banner Sliders" onNavigate={() => setSidebarOpen(false)} />
            </>
          )}

          <div className="text-[10px] font-black text-gray-500 uppercase tracking-widest pl-3 mt-7 mb-2">Management</div>
          
          {/* Universities: Show for Admin or University role */}
          {(admin?.role === 'admin' || admin?.role === 'university') && (
            <SidebarLink 
              to="/universities" 
              icon={<Building2 size={20} />} 
              label={admin?.role === 'admin' ? "All Universities" : "My University"} 
              onNavigate={() => setSidebarOpen(false)} 
            />
          )}

          {/* Scholarships: Show for Admin or Scholarship role */}
          {(admin?.role === 'admin' || admin?.role === 'scholarship') && (
            <SidebarLink 
              to="/scholarships" 
              icon={<BookOpen size={20} />} 
              label={admin?.role === 'admin' ? "All Scholarships" : "My Scholarship"} 
              onNavigate={() => setSidebarOpen(false)} 
            />
          )}

          {(admin?.role === 'admin') && (
            <>
              <div className="text-[10px] font-black text-gray-500 uppercase tracking-widest pl-3 mt-7 mb-2">Platform Records</div>
              <SidebarLink to="/admin-applications" icon={<FileText size={20} />} label="Total Applications" onNavigate={() => setSidebarOpen(false)} />
              <SidebarLink to="/accounts" icon={<UserCircle size={20} />} label="Staff Accounts" onNavigate={() => setSidebarOpen(false)} />
              <div className="text-[10px] font-black text-gray-500 uppercase tracking-widest pl-3 mt-7 mb-2">User Access</div>
              <SidebarLink to="/users" icon={<Users2 size={20} />} label="Platform Users" onNavigate={() => setSidebarOpen(false)} />
            </>
          )}
          
          <div className="text-[10px] font-black text-gray-500 uppercase tracking-widest pl-3 mt-7 mb-2">System</div>
          <SidebarLink to="/settings" icon={<Settings size={20} />} label="Admin Settings" onNavigate={() => setSidebarOpen(false)} />
        </nav>

        <div className="m-5 p-4 bg-white/5 rounded-2xl border border-white/10 flex items-center gap-3 relative group">
          <div className="w-10 h-10 bg-teal-600 rounded-full flex items-center justify-center font-bold text-white shadow-inner">
            {admin?.name?.charAt(0) || 'A'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold truncate leading-tight">{admin?.name || 'Administrator'}</p>
            <p className="text-[10px] text-teal-400 font-bold uppercase tracking-wider mt-0.5">{admin?.role || 'Super Admin'}</p>
          </div>
          <button
            onClick={onLogout}
            className="p-2 ml-auto text-gray-400 hover:text-red-400 hover:bg-red-400/10 rounded-xl transition duration-200"
            title="Logout"
          >
            <LogOut size={18} />
          </button>
        </div>
      </aside>

      <header className="admin-mobile-topbar fixed top-0 left-0 right-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur-sm px-4 py-3 lg:hidden">
        <div className="flex items-center justify-between">
          <button
            type="button"
            className="rounded-xl border border-slate-200 bg-white p-2 text-slate-700 hover:bg-slate-50"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open sidebar"
          >
            <Menu size={19} />
          </button>
          <span className="text-sm font-extrabold tracking-wide text-slate-800">SINDH ADMIN</span>
          <button
            type="button"
            onClick={onLogout}
            className="rounded-xl border border-slate-200 bg-white p-2 text-slate-700 hover:bg-slate-50"
            aria-label="Logout"
          >
            <LogOut size={17} />
          </button>
        </div>
      </header>

      <main className="w-full overflow-x-hidden p-4 pt-20 sm:p-6 sm:pt-24 lg:ml-72 lg:w-[calc(100%-18rem)] lg:p-10 lg:pt-10 min-h-screen">
        <Routes>
          <Route path="/" element={<AdminDashboard admin={admin} />} />
          <Route path="/banners" element={<Banners />} />
          
          <Route path="/universities" element={<UniHistory />} />
          <Route path="/universities/add" element={<Universities />} />
          <Route path="/universities/edit/:id" element={<Universities />} />
          
          <Route path="/scholarships" element={<ScholarHistory />} />
          <Route path="/scholarships/add" element={<Scholarships />} />
          <Route path="/scholarships/edit/:id" element={<Scholarships />} />
          
          <Route path="/users" element={<UsersList />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/accounts" element={<Accounts />} />
          <Route path="/applicants/:type/:id" element={<Applicants />} />
          <Route path="/admin-applications" element={<AdminApplications />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
    </div>
  );
}

function SidebarLink({ to, icon, label, onNavigate }) {
  const location = useLocation();
  const isActive =
    to === '/'
      ? location.pathname === '/'
      : location.pathname === to || location.pathname.startsWith(`${to}/`);

  return (
    <Link 
      to={to}
      onClick={onNavigate}
      className={`flex items-center gap-3.5 p-3.5 px-5 rounded-2xl transition-all duration-300 group
        ${isActive 
          ? 'bg-teal-600 text-white shadow-xl shadow-teal-900/40 translate-x-1' 
          : 'text-gray-400 hover:bg-white/5 hover:text-white active:scale-95'}`}
    >
      <div className={`${isActive ? 'text-white' : 'text-gray-500 group-hover:text-teal-400'} transition-colors`}>
        {icon}
      </div>
      <span className="font-bold text-sm tracking-wide">{label}</span>
      {isActive && (
        <div className="ml-auto w-1.5 h-1.5 bg-white rounded-full animate-pulse shadow-[0_0_8px_rgba(255,255,255,0.8)]" />
      )}
    </Link>
  );
}

export default App;
