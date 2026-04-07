import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Building2, BookOpen, Users2, ChevronRight, FileText } from 'lucide-react';
import API from '../api';

const getArrayFromResponse = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
};

const getCountFromResponse = (payload) => {
  if (typeof payload?.data?.total === 'number') return payload.data.total;
  if (typeof payload?.total === 'number') return payload.total;
  return getArrayFromResponse(payload).length;
};

export default function AdminDashboard({ admin }) {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    universities: 0,
    scholarships: 0,
    users: 0,
    applications: 0,
  });
  const [loading, setLoading] = useState(true);

  const isSuperAdmin = admin?.role === 'admin';
  const isUniAdmin = admin?.role === 'university';
  const isScholAdmin = admin?.role === 'scholarship';

  useEffect(() => {
    const fetchDashboardStats = async () => {
      setLoading(true);
      try {
        const fetchers = [];
        if (isSuperAdmin || isUniAdmin) fetchers.push(API.get('/universities/admin/list').catch(() => null));
        if (isSuperAdmin || isScholAdmin) fetchers.push(API.get('/scholarships/admin/list').catch(() => null));
        if (isSuperAdmin) fetchers.push(API.get('/users', { params: { page: 1, limit: 1 } }).catch(() => null));
        if (isSuperAdmin) fetchers.push(API.get('/applications/total').catch(() => null));

        const results = await Promise.all(fetchers);
        
        let uniIdx = -1, scholarIdx = -1, userIdx = -1, appIdx = -1;
        let current = 0;
        if (isSuperAdmin || isUniAdmin) uniIdx = current++;
        if (isSuperAdmin || isScholAdmin) scholarIdx = current++;
        if (isSuperAdmin) userIdx = current++;
        if (isSuperAdmin) appIdx = current++;

        const universities = uniIdx !== -1 ? getArrayFromResponse(results[uniIdx]?.data) : [];
        const scholarships = scholarIdx !== -1 ? getArrayFromResponse(results[scholarIdx]?.data) : [];
        const usersCount =
          userIdx !== -1
            ? (results[userIdx]?.data?.pagination?.total ?? getArrayFromResponse(results[userIdx]?.data).length)
            : 0;
        const appCount = appIdx !== -1 ? getCountFromResponse(results[appIdx]?.data) : 0;

        let institutionalApps = 0;
        if (!isSuperAdmin) {
           const type = isUniAdmin ? 'university' : 'scholarship';
           const entityId = universities[0]?._id || scholarships[0]?._id;
           if (entityId) {
             const res = await API.get(`/applications/${type}/${entityId}`).catch(() => null);
             institutionalApps =
               res?.data?.pagination?.total ??
               getArrayFromResponse(res?.data).length;
           }
        }

        setStats({
          universities: universities.length,
          scholarships: scholarships.length,
          users: usersCount,
          applications: isSuperAdmin ? appCount : institutionalApps
        });
      } catch {
        setStats({ universities: 0, scholarships: 0, users: 0, applications: 0 });
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardStats();
  }, [isSuperAdmin, isUniAdmin, isScholAdmin]);

  const gradientBg = isSuperAdmin
    ? 'linear-gradient(145deg, #0f766e, #0369a1)'
    : isUniAdmin
      ? 'linear-gradient(145deg, #4f46e5, #4338ca)'
      : 'linear-gradient(145deg, #ec4899, #be185d)';

  const roleName = isSuperAdmin ? 'Super Admin' : isUniAdmin ? 'University Admin' : 'Scholarship Admin';

  return (
    <div className="admin-dashboard">
      {/* Welcome Banner */}
      <div
        style={{
          padding: '24px',
          background: gradientBg,
          borderRadius: '16px',
          color: '#fff',
          marginBottom: '20px',
          boxShadow: '0 12px 30px rgba(0, 0, 0, 0.12)',
        }}
      >
        <p style={{ margin: 0, fontSize: '11px', letterSpacing: '0.16em', opacity: 0.8, textTransform: 'uppercase' }}>
          {roleName}
        </p>
        <h1 style={{ margin: '6px 0 4px 0', fontSize: '24px', lineHeight: 1.3, fontWeight: 800 }}>
          Welcome, {admin?.name || 'Admin'}
        </h1>
        <p style={{ margin: 0, fontSize: '13px', opacity: 0.85 }}>
          {isSuperAdmin
            ? 'Full platform control — universities, scholarships, users & applicants.'
            : `Manage your ${isUniAdmin ? 'university' : 'scholarship'} listings and review applicants.`}
        </p>
      </div>

      {/* Stat Cards */}
      <div className="stats-grid" style={{ marginBottom: '20px' }}>
        <div className="stat-card" onClick={() => navigate(isUniAdmin ? '/universities' : isScholAdmin ? '/scholarships' : '/universities')} style={{ cursor: 'pointer' }}>
          <div className="stat-icon" style={{ background: 'rgba(79, 70, 229, 0.1)', color: '#4f46e5' }}>
            {isScholAdmin ? <BookOpen size={20} /> : <Building2 size={20} />}
          </div>
          <div className="stat-value">{loading ? '...' : (isSuperAdmin ? stats.universities : stats.universities || 1)}</div>
          <div className="stat-label">{isSuperAdmin ? 'Universities' : isUniAdmin ? 'My University' : 'My Scholarship'}</div>
        </div>

        {isSuperAdmin && (
          <div className="stat-card">
            <div className="stat-icon" style={{ background: 'rgba(236, 72, 153, 0.1)', color: '#ec4899' }}>
              <BookOpen size={20} />
            </div>
            <div className="stat-value">{loading ? '...' : stats.scholarships}</div>
            <div className="stat-label">Scholarships</div>
          </div>
        )}

        <div className="stat-card" onClick={() => navigate(isSuperAdmin ? '/admin-applications' : (isUniAdmin ? '/universities' : '/scholarships'))} style={{ cursor: 'pointer' }}>
          <div className="stat-icon" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
            <FileText size={20} />
          </div>
          <div className="stat-value">{loading ? '...' : stats.applications}</div>
          <div className="stat-label">{isSuperAdmin ? 'Applications' : 'My Applicants'}</div>
        </div>

        {isSuperAdmin && (
          <div className="stat-card">
            <div className="stat-icon" style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b' }}>
              <Users2 size={20} />
            </div>
            <div className="stat-value">{loading ? '...' : stats.users}</div>
            <div className="stat-label">Registered Users</div>
          </div>
        )}
      </div>

      {/* Sub-admin Quick Actions */}
      {!isSuperAdmin && (
        <div className="quick-action-grid">
          <Link to={isUniAdmin ? '/universities/add' : '/scholarships/add'} className="quick-action-card dashed">
            <div className="quick-action-icon" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>+</div>
            <h3>Create New Post</h3>
            <p>Publish a new {isUniAdmin ? 'university listing' : 'scholarship opportunity'}</p>
          </Link>

          <Link to={isUniAdmin ? '/universities' : '/scholarships'} className="quick-action-card">
            <div className="quick-action-icon" style={{ background: 'rgba(79, 70, 229, 0.1)', color: '#4f46e5' }}>📋</div>
            <h3>My Post History</h3>
            <p>View and edit your existing postings</p>
          </Link>

          <Link to={isUniAdmin ? '/universities' : '/scholarships'} className="quick-action-card">
            <div className="quick-action-icon" style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b' }}>👥</div>
            <h3>My Applicants</h3>
            <p>Review candidates who applied</p>
          </Link>
        </div>
      )}

      {/* Super Admin Quick Links */}
      {isSuperAdmin && (
        <div className="table-card">
          <div className="table-header">
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800 }}>Quick Links</h3>
          </div>
          <div style={{ padding: '12px' }}>
            <div style={{ display: 'grid', gap: '8px' }}>
              {[
                { to: '/universities', label: 'Manage Universities', desc: 'Create, edit or review university listings' },
                { to: '/scholarships', label: 'Manage Scholarships', desc: 'Manage scholarship opportunities' },
                { to: '/admin-applications', label: 'Total Applications', desc: 'Review all submitted applications' },
                { to: '/users', label: 'Platform Users', desc: 'Review and manage registered users' },
                { to: '/banners', label: 'Banner Sliders', desc: 'Control home page slider visuals' },
              ].map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: '12px',
                    background: '#fff',
                    padding: '12px 14px',
                    textDecoration: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '10px',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-primary)' }}>{item.label}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>{item.desc}</div>
                  </div>
                  <ChevronRight size={17} color="#64748b" style={{ flexShrink: 0 }} />
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
