import { useEffect, useState } from 'react';
import API from '../api';

export default function Users() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pagination, setPagination] = useState({
    total: 0,
    totalPages: 1,
    limit: 20,
  });

  const fetchData = async (page = currentPage, search = searchTerm) => {
    setLoading(true);
    try {
      const params = {
        page,
        limit: pagination.limit,
      };
      const trimmedSearch = search.trim();
      if (trimmedSearch) params.search = trimmedSearch;

      const res = await API.get('/users', { params });
      const serverPagination = res.data?.pagination || {};
      setData(res.data.data || []);
      setPagination((prev) => ({
        ...prev,
        total: serverPagination.total ?? (res.data.data || []).length,
        totalPages: serverPagination.totalPages ?? 1,
      }));
    } catch {
      setData([]);
      setPagination((prev) => ({
        ...prev,
        total: 0,
        totalPages: 1,
      }));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchData(currentPage, searchTerm);
    }, 220);
    return () => clearTimeout(timer);
  }, [currentPage, searchTerm]);

  const handleDelete = async (id) => {
    if (!confirm('Delete this user?')) return;
    try {
      await API.delete(`/users/${id}`);
      fetchData(currentPage, searchTerm);
    } catch {
      alert('Delete failed');
    }
  };

  const [showEditModal, setShowEditModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);

  const handleEditClick = (user) => {
    setEditingUser({ ...user, password: '' });
    setShowEditModal(true);
  };

  const handleUpdate = async () => {
    try {
      await API.put(`/users/${editingUser._id}/profile`, editingUser);
      alert('User updated successfully');
      setShowEditModal(false);
      fetchData(currentPage, searchTerm);
    } catch (err) {
      alert('Update failed: ' + (err.response?.data?.message || err.message));
    }
  };

  return (
    <div style={{ padding: '0px' }}>
      <div className="table-card" style={{ border: 'none', boxShadow: 'none', background: 'transparent' }}>
        <div className="table-header" style={{ 
          flexDirection: 'column', 
          alignItems: 'flex-start', 
          gap: '20px', 
          padding: '24px', 
          background: 'white', 
          borderRadius: '20px 20px 0 0',
          borderBottom: '1px solid #f1f5f9' 
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
            <div>
               <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>👥 Registered Students</h2>
               <p style={{ margin: '4px 0 0 0', fontSize: 13, color: '#64748b' }}>Manage student accounts, credentials and profiles.</p>
            </div>
            <span className="badge badge-active" style={{ fontSize: 14, padding: '8px 16px', borderRadius: 12, background: 'rgba(79, 70, 229, 0.1)', color: 'var(--primary)', fontWeight: 800 }}>
              Total Students: {pagination.total}
            </span>
          </div>

          <div className="filter-bar" style={{ width: '100%', background: 'transparent', padding: 0, border: 'none', boxShadow: 'none' }}>
            <div className="search-input-group" style={{ position: 'relative', width: '100%', maxWidth: '500px' }}>
              <span style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', opacity: 0.6, fontSize: 18 }}>🔍</span>
              <input 
                type="text" 
                placeholder="Search by student name, email or country..." 
                value={searchTerm}
                onChange={(e) => {
                  setCurrentPage(1);
                  setSearchTerm(e.target.value);
                }}
                style={{ 
                  width: '100%', 
                  padding: '14px 14px 14px 48px', 
                  borderRadius: '14px', 
                  border: '1.5px solid #e2e8f0', 
                  background: '#f8fafc', 
                  color: '#1e293b', 
                  fontSize: 15,
                  fontWeight: 500,
                  transition: 'all 0.3s ease',
                  outline: 'none' 
                }}
              />
            </div>
          </div>
        </div>

        {loading ? (
          <div className="loading" style={{ padding: '60px' }}><div className="spinner"></div> Loading students database...</div>
        ) : data.length === 0 ? (
          <div className="empty-msg" style={{ padding: '60px', background: 'white' }}>
            {searchTerm ? 'No students found matching your search.' : 'No students registered yet.'}
          </div>
        ) : (
          <div className="table-scroll-wrap" style={{ background: 'white', borderRadius: '0 0 20px 20px' }}>
            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
              <thead>
                <tr>
                  <th style={{ padding: '15px 24px' }}>Student Info</th>
                  <th style={{ padding: '15px 24px' }}>Email Address</th>
                  <th style={{ padding: '15px 24px' }}>Location</th>
                  <th style={{ padding: '15px 24px' }}>Status</th>
                  <th style={{ padding: '15px 24px' }}>Joined Date</th>
                  <th style={{ textAlign: 'center', padding: '15px 24px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.map((u) => (
                  <tr key={u._id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '15px 24px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <div style={{
                          width: 44, height: 44, borderRadius: 14,
                          background: 'linear-gradient(135deg, var(--primary), #4f46e5)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 18, fontWeight: 800, color: 'white', flexShrink: 0,
                          boxShadow: '0 4px 12px rgba(79,70,229,0.2)'
                        }}>
                          {u.name?.charAt(0).toUpperCase() || '?'}
                        </div>
                        <div>
                           <div style={{ fontWeight: 800, fontSize: 15, color: '#1e293b' }}>{u.name}</div>
                           <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>ID: {u._id.slice(-6)}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '15px 24px', color: '#475569', fontWeight: 600, fontSize: 13 }}>{u.email}</td>
                    <td style={{ padding: '15px 24px' }}>
                       <div style={{ fontWeight: 700, color: '#1e293b', fontSize: 14 }}>{u.country || '—'}</div>
                       <div style={{ fontSize: 11, color: '#64748b', fontWeight: 500 }}>{u.city || u.state || 'Location not set'}</div>
                    </td>
                    <td style={{ padding: '15px 24px' }}>
                      <span style={{ 
                        padding: '6px 14px', 
                        borderRadius: 10, 
                        fontSize: 11, 
                        fontWeight: 800,
                        background: u.isActive ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                        color: u.isActive ? '#059669' : '#dc2626'
                      }}>
                        {u.isActive ? '• ACTIVE' : '• INACTIVE'}
                      </span>
                    </td>
                    <td style={{ padding: '15px 24px', fontSize: 13, color: '#475569', fontWeight: 500 }}>
                      {new Date(u.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                    </td>
                    <td style={{ padding: '15px 24px' }}>
                      <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                         <button className="btn-icon" onClick={() => handleEditClick(u)} title="Edit Account Credentials">✏️</button>
                         <button className="btn-icon delete" onClick={() => handleDelete(u._id)} title="Delete User">🗑️</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {pagination.totalPages > 1 && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 12,
                  padding: '16px 20px',
                  borderTop: '1px solid #f1f5f9',
                }}
              >
                <button
                  className="btn-pagination"
                  onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                >
                  Previous
                </button>
                <span style={{ fontSize: 13, color: '#475569', fontWeight: 700 }}>
                  Page {currentPage} of {pagination.totalPages}
                </span>
                <button
                  className="btn-pagination"
                  onClick={() =>
                    setCurrentPage((prev) =>
                      Math.min(pagination.totalPages, prev + 1)
                    )
                  }
                  disabled={currentPage >= pagination.totalPages}
                >
                  Next
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {showEditModal && editingUser && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '600px', width: '90%' }}>
            <div className="modal-header">
               <div style={{ display: 'flex', alignItems: 'center', gap: 15 }}>
                  <div className="admin-avatar" style={{ width: 45, height: 45 }}>{editingUser.name?.charAt(0)}</div>
                  <div>
                    <h3 style={{ margin: 0 }}>Edit Student Account</h3>
                    <span style={{ fontSize: 12, opacity: 0.7 }}>Full system control over credentials</span>
                  </div>
               </div>
               <button className="btn-close" onClick={() => setShowEditModal(false)}>✕</button>
            </div>
            <div className="modal-body" style={{ display: 'grid', gap: 20, padding: 25 }}>
               <div className="form-group">
                 <label style={{ fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: 8, display: 'block' }}>Display Name</label>
                 <input 
                   type="text" 
                   value={editingUser.name || ''} 
                   onChange={e => setEditingUser({...editingUser, name: e.target.value})}
                   style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1.5px solid #eef2f6', background: '#f8fafc', fontWeight: 600 }}
                 />
               </div>
               <div className="form-group">
                 <label style={{ fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: 8, display: 'block' }}>Email Address</label>
                 <input 
                   type="email" 
                   value={editingUser.email || ''} 
                   onChange={e => setEditingUser({...editingUser, email: e.target.value})}
                   style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1.5px solid #eef2f6', background: '#f8fafc', fontWeight: 600 }}
                 />
               </div>
               <div className="form-group">
                 <label style={{ fontSize: 11, fontWeight: 800, color: '#f59e0b', textTransform: 'uppercase', marginBottom: 8, display: 'block' }}>Set New Password (Leave empty to keep current)</label>
                 <input 
                   type="password" 
                   placeholder="At least 6 characters"
                   value={editingUser.password || ''} 
                   onChange={e => setEditingUser({...editingUser, password: e.target.value})}
                   style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1.5px solid #fef3c7', background: '#fffbeb', fontWeight: 600 }}
                 />
               </div>
               <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 20 }}>
                  <div className="form-group">
                    <label style={{ fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: 8, display: 'block' }}>Father's Name</label>
                    <input 
                      type="text" 
                      value={editingUser.fatherName || ''} 
                      onChange={e => setEditingUser({...editingUser, fatherName: e.target.value})}
                      style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1.5px solid #eef2f6', background: '#f8fafc', fontWeight: 600 }}
                    />
                  </div>
                  <div className="form-group">
                    <label style={{ fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: 8, display: 'block' }}>Date of Birth</label>
                    <input 
                      type="date" 
                      value={editingUser.dateOfBirth ? new Date(editingUser.dateOfBirth).toISOString().split('T')[0] : ''} 
                      onChange={e => setEditingUser({...editingUser, dateOfBirth: e.target.value})}
                      style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1.5px solid #eef2f6', background: '#f8fafc', fontWeight: 600 }}
                    />
                  </div>
               </div>
            </div>
            <div className="modal-footer" style={{ padding: '15px 25px', borderTop: '1px solid #f1f5f9', background: '#f8fafc', borderRadius: '0 0 20px 20px' }}>
               <button 
                 onClick={handleUpdate} 
                 style={{ 
                   width: '100%', 
                   padding: '14px', 
                   background: 'linear-gradient(135deg, var(--primary), #4338ca)', 
                   color: 'white', 
                   border: 'none', 
                   borderRadius: '14px', 
                   fontWeight: 800, 
                   fontSize: 15, 
                   cursor: 'pointer',
                   boxShadow: '0 4px 12px rgba(79, 70, 229, 0.2)'
                 }}
               >
                 Save Account Changes
               </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
