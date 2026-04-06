import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../api';
import { getStates, getCities } from '../data/locations';

const ADMIN_COUNTRY = 'Pakistan';

export default function UniHistory() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [searchTerm, setSearchTerm] = useState('');

  // Filters
  const [filterState, setFilterState] = useState('');
  const [filterCity, setFilterCity] = useState('');

  const adminInfoStr = localStorage.getItem('admin');
  const adminInfo = adminInfoStr ? JSON.parse(adminInfoStr) : null;
  const isSuperAdmin = adminInfo?.role === 'admin';

  const navigate = useNavigate();

  const fetchData = () => {
    setLoading(true);
    API.get('/universities/admin/list')
      .then((res) => setData(res.data.data || []))
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this university?')) return;
    try {
      await API.delete(`/universities/${id}`);
      fetchData();
    } catch {
      alert('Failed to delete university');
    }
  };

  const getStatus = (deadline) => {
    if (!deadline) return { label: 'No Deadline', color: 'var(--success)' };
    
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const dDate = new Date(deadline);
      const dMidnight = new Date(
        dDate.getUTCFullYear(),
        dDate.getUTCMonth(),
        dDate.getUTCDate()
      );
      dMidnight.setHours(0, 0, 0, 0);

      return today.getTime() > dMidnight.getTime()
        ? { label: 'Expired', color: 'var(--danger)' }
        : { label: 'Active', color: 'var(--success)' };
    } catch {
      return { label: 'Active', color: 'var(--success)' };
    }
  };

  // Filtering Logic
  const filteredData = useMemo(() => {
    return data.filter(u => {
      const matchesState = filterState ? u.state === filterState : true;
      const matchesCity = filterCity ? u.city === filterCity : true;
      const matchesSearch = searchTerm ? 
        (u.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
         u.city?.toLowerCase().includes(searchTerm.toLowerCase())) : true;
      return matchesState && matchesCity && matchesSearch;
    });
  }, [data, filterState, filterCity, searchTerm]);

  // Pagination
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredData.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(filteredData.length / itemsPerPage);

  const getPageNumbers = () => {
    const pageNumbers = [];
    let startPage = Math.max(1, currentPage - 1);
    let endPage = Math.min(totalPages, startPage + 2);
    if (endPage - startPage < 2) {
      startPage = Math.max(1, endPage - 2);
    }
    for (let i = Math.max(1, startPage); i <= endPage; i++) {
        pageNumbers.push(i);
    }
    return pageNumbers;
  };

  // Account Modal State
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [selectedUni, setSelectedUni] = useState(null);
  const [accountEmail, setAccountEmail] = useState('');
  const [accountPassword, setAccountPassword] = useState('');
  const [accountLoading, setAccountLoading] = useState(false);

  const fetchAccount = async (uni) => {
    setSelectedUni(uni);
    setAccountLoading(true);
    setShowAccountModal(true);
    try {
      const res = await API.get(`/universities/${uni._id}/account`);
      setAccountEmail(res.data.data?.email || '');
      setAccountPassword('');
    } catch {
      console.error('Failed to fetch account');
    } finally {
      setAccountLoading(false);
    }
  };

  const handleSaveAccount = async () => {
    if (!accountEmail || !accountPassword) {
        alert('Email and Password are mandatory to set access.');
        return;
    }
    setAccountLoading(true);
    try {
      await API.put(`/universities/${selectedUni._id}/account`, {
        email: accountEmail,
        password: accountPassword,
        name: selectedUni.name
      });
      alert('Credentials saved successfully!');
      fetchData();
      setShowAccountModal(false);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to save credentials');
    } finally {
      setAccountLoading(false);
    }
  };

  const renderThumbnail = (u) => {
    if (u.thumbnail) {
      const src = u.thumbnail.startsWith('http') || u.thumbnail.startsWith('data:') 
        ? u.thumbnail 
        : `http://localhost:5000${u.thumbnail.startsWith('/') ? '' : '/'}${u.thumbnail}`;
      return <img src={src} alt={u.name} />;
    }
    return <span style={{ fontSize: 20 }}>🏛️</span>;
  };

  return (
    <div>
      <div className="table-card">
        <div className="table-header" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '15px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            <h2 style={{ margin: 0, fontSize: '20px' }}>📋 University Records</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <span className="badge badge-active">
                Total: {filteredData.length}
              </span>
              <button 
                onClick={() => navigate('/universities/add')}
                style={{ 
                  padding: '9px 18px', 
                  borderRadius: '10px', 
                  background: 'var(--primary)', 
                  color: 'white', 
                  fontWeight: 700, 
                  border: 'none', 
                  cursor: 'pointer',
                  fontSize: '13px',
                }}
              >
                + Add New
              </button>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="filter-bar">
            <div style={{ position: 'relative', flex: 1, minWidth: '180px' }}>
                <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }}>🔍</span>
                <input 
                    type="text" 
                    placeholder="Search by name or city..." 
                    value={searchTerm}
                    onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                    style={{ width: '100%', paddingLeft: '35px' }}
                />
            </div>

            <select 
                value={filterState} 
                onChange={(e) => { setFilterState(e.target.value); setFilterCity(''); setCurrentPage(1); }}
            >
                <option value="">All States</option>
                {getStates(ADMIN_COUNTRY).map(s => <option key={s} value={s}>{s}</option>)}
            </select>

            <select 
                value={filterCity} 
                onChange={(e) => { setFilterCity(e.target.value); setCurrentPage(1); }} 
                disabled={!filterState}
                style={{ opacity: !filterState ? 0.5 : 1 }}
            >
                <option value="">All Cities</option>
                {getCities(ADMIN_COUNTRY, filterState).map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="loading"><div className="spinner"></div> Loading...</div>
        ) : data.length === 0 ? (
          <div className="empty-msg">No records found. Click "+ Add New" to create one.</div>
        ) : (
          <>
            <div className="history-list">
              {currentItems.map((u, index) => {
                const status = getStatus(u.deadline);
                const serialNumber = indexOfFirstItem + index + 1;
                return (
                  <div className="history-item" key={u._id}>
                    <div style={{ width: '28px', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 'bold', flexShrink: 0 }}>
                        #{serialNumber}
                    </div>
                    <div className="history-thumb">
                      {renderThumbnail(u)}
                    </div>
                    
                    <div className="history-info">
                      <h4>{u.name}</h4>
                      <p>📍 {u.city || 'N/A'}, {u.state || ADMIN_COUNTRY}</p>
                    </div>

                    <div className="history-status">
                      <div style={{ fontSize: 13, fontWeight: 700, color: status.color }}>{status.label}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 3 }}>
                        {u.deadline ? u.deadline.split('T')[0] : 'No Date'}
                      </div>
                    </div>

                    <div className="history-actions">
                      {isSuperAdmin && (
                        <>
                          {!u.hasAdmin ? (
                            <button 
                              className="btn-action-secondary"
                              onClick={() => fetchAccount(u)}
                            >
                              🔑 Credentials
                            </button>
                          ) : (
                            <span className="badge" style={{ background: 'rgba(0,184,148,0.1)', color: '#00b894', border: '1px solid rgba(0,184,148,0.2)' }}>
                              ✅ Assigned
                            </span>
                          )}
                        </>
                      )}
                      <button 
                        className="btn-action-primary"
                        onClick={() => navigate(`/applicants/university/${u._id}`)}
                      >
                        Applications
                      </button>
                      <button className="btn-icon" onClick={() => navigate(`/universities/edit/${u._id}`)}>✏️</button>
                      {isSuperAdmin && (
                        <button className="btn-icon delete" onClick={() => handleDelete(u._id)}>🗑️</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="pagination-container">
                <button 
                  className="btn-pagination" 
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                >
                  Previous
                </button>

                {getPageNumbers().map(num => (
                  <button
                    key={num}
                    className="btn-pagination"
                    onClick={() => setCurrentPage(num)}
                    style={{
                      width: '38px',
                      height: '38px',
                      padding: 0,
                      background: currentPage === num ? 'var(--primary)' : '#fff',
                      color: currentPage === num ? 'white' : 'var(--text-primary)',
                      fontWeight: 'bold',
                    }}
                  >
                    {num}
                  </button>
                ))}

                <button 
                  className="btn-pagination" 
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Account Modal */}
      {showAccountModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '420px', padding: '30px', animation: 'modalSlideUp 0.3s ease-out' }}>
            <h3 style={{ margin: '0 0 6px 0', fontSize: '18px' }}>
              🔑 Set Admin Credentials
            </h3>
            <p style={{ margin: '0 0 20px 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
              For: <strong>{selectedUni?.name}</strong>
            </p>

            {accountLoading ? (
              <div className="loading"><div className="spinner"></div></div>
            ) : (
              <>
                <div style={{ display: 'grid', gap: '14px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, marginBottom: '6px' }}>Email *</label>
                    <input
                      type="email"
                      value={accountEmail}
                      onChange={(e) => setAccountEmail(e.target.value)}
                      placeholder="admin@university.edu"
                      style={{ width: '100%', padding: '11px 14px', borderRadius: '10px', border: '1px solid var(--border)', fontSize: '14px', outline: 'none' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, marginBottom: '6px' }}>Password *</label>
                    <input
                      type="password"
                      value={accountPassword}
                      onChange={(e) => setAccountPassword(e.target.value)}
                      placeholder="Set secure password"
                      style={{ width: '100%', padding: '11px 14px', borderRadius: '10px', border: '1px solid var(--border)', fontSize: '14px', outline: 'none' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '10px', marginTop: '20px', justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => setShowAccountModal(false)}
                    style={{ padding: '10px 20px', borderRadius: '10px', border: '1px solid var(--border)', background: '#fff', fontWeight: 700, cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveAccount}
                    disabled={accountLoading}
                    style={{ padding: '10px 20px', borderRadius: '10px', background: 'var(--primary)', color: '#fff', border: 'none', fontWeight: 700, cursor: 'pointer' }}
                  >
                    {accountLoading ? 'Saving...' : 'Save Credentials'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
