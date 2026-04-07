import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import API, { resolveAssetUrl } from '../api';
import { getStates, getCities } from '../data/locations';

const ADMIN_COUNTRY = 'Pakistan';

export default function ScholarHistory() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [searchTerm, setSearchTerm] = useState('');
  const [filterState, setFilterState] = useState('');
  const [filterCity, setFilterCity] = useState('');

  const adminInfoStr = localStorage.getItem('admin') || sessionStorage.getItem('admin');
  let adminInfo = null;
  try {
    adminInfo = adminInfoStr ? JSON.parse(adminInfoStr) : null;
  } catch {
    adminInfo = null;
  }
  const isSuperAdmin = adminInfo?.role === 'admin';

  const navigate = useNavigate();

  const fetchData = () => {
    setLoading(true);
    API.get('/scholarships/admin/list')
      .then((res) => setData(res.data.data || []))
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this scholarship?')) return;
    try {
      await API.delete(`/scholarships/${id}`);
      fetchData();
    } catch {
      alert('Failed to delete scholarship');
    }
  };

  const getStatus = (deadline) => {
    if (!deadline) return { label: 'No Deadline', color: 'var(--success)' };
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const dDate = new Date(deadline);
      const dMidnight = new Date(dDate.getUTCFullYear(), dDate.getUTCMonth(), dDate.getUTCDate());
      dMidnight.setHours(0, 0, 0, 0);
      return today.getTime() > dMidnight.getTime()
        ? { label: 'Expired', color: 'var(--danger)' }
        : { label: 'Active', color: 'var(--success)' };
    } catch {
      return { label: 'Active', color: 'var(--success)' };
    }
  };

  const filteredData = useMemo(() => {
    return data.filter(s => {
      const matchesState = filterState ? s.state === filterState : true;
      const matchesCity = filterCity ? s.city === filterCity : true;
      const matchesSearch = searchTerm
        ? (s.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
           s.provider?.toLowerCase().includes(searchTerm.toLowerCase()))
        : true;
      return matchesState && matchesCity && matchesSearch;
    });
  }, [data, filterState, filterCity, searchTerm]);

  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredData.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(filteredData.length / itemsPerPage);

  const getPageNumbers = () => {
    const pageNumbers = [];
    let startPage = Math.max(1, currentPage - 1);
    let endPage = Math.min(totalPages, startPage + 2);
    if (endPage - startPage < 2) startPage = Math.max(1, endPage - 2);
    for (let i = Math.max(1, startPage); i <= endPage; i++) pageNumbers.push(i);
    return pageNumbers;
  };

  // Account Modal State
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [selectedScholar, setSelectedScholar] = useState(null);
  const [accountEmail, setAccountEmail] = useState('');
  const [accountPassword, setAccountPassword] = useState('');
  const [accountLoading, setAccountLoading] = useState(false);

  const fetchAccount = async (scholar) => {
    setSelectedScholar(scholar);
    setAccountLoading(true);
    setShowAccountModal(true);
    try {
      const res = await API.get(`/scholarships/${scholar._id}/account`);
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
      alert('Email and Password are mandatory.');
      return;
    }
    setAccountLoading(true);
    try {
      await API.put(`/scholarships/${selectedScholar._id}/account`, {
        email: accountEmail,
        password: accountPassword,
        name: selectedScholar.title
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

  const renderThumbnail = (s) => {
    const thumb = s.thumbnail || s.image;
    if (thumb) {
      const src = resolveAssetUrl(thumb);
      return <img src={src} alt={s.title} />;
    }
    return <span style={{ fontSize: 20 }}>🎓</span>;
  };

  return (
    <div>
      <div className="table-card">
        <div className="table-header" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '15px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            <h2 style={{ margin: 0, fontSize: '20px' }}>📜 Scholarship Records</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <span className="badge" style={{ background: 'rgba(247,37,133,0.1)', color: 'var(--secondary)' }}>
                Total: {filteredData.length}
              </span>
              <button 
                onClick={() => navigate('/scholarships/add')}
                style={{ 
                  padding: '9px 18px', 
                  borderRadius: '10px', 
                  background: 'var(--secondary)', 
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
                placeholder="Search by title or provider..." 
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
              {currentItems.map((s, index) => {
                const status = getStatus(s.deadline);
                const serialNumber = indexOfFirstItem + index + 1;
                return (
                  <div className="history-item" key={s._id}>
                    <div style={{ width: '28px', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 'bold', flexShrink: 0 }}>
                      #{serialNumber}
                    </div>
                    <div className="history-thumb">
                      {renderThumbnail(s)}
                    </div>

                    <div className="history-info">
                      <h4>{s.title}</h4>
                      <p>🏢 {s.provider || 'N/A'} • {s.state || s.country || ADMIN_COUNTRY}</p>
                    </div>

                    <div className="history-status">
                      <div style={{ fontSize: 13, fontWeight: 700, color: status.color }}>{status.label}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 3 }}>
                        {s.deadline ? s.deadline.split('T')[0] : 'No Date'}
                      </div>
                    </div>

                    <div className="history-actions">
                      {isSuperAdmin && (
                        <>
                          {!s.hasAdmin ? (
                            <button className="btn-action-secondary" onClick={() => fetchAccount(s)}>
                              🔑 Credentials
                            </button>
                          ) : (
                            <span className="badge" style={{ background: 'rgba(247,37,133,0.1)', color: '#f72585', border: '1px solid rgba(247,37,133,0.2)' }}>
                              ✅ Assigned
                            </span>
                          )}
                        </>
                      )}
                      <button 
                        className="btn-action-primary"
                        onClick={() => navigate(`/applicants/scholarship/${s._id}`)}
                      >
                        Applications
                      </button>
                      <button className="btn-icon" onClick={() => navigate(`/scholarships/edit/${s._id}`)}>✏️</button>
                      {isSuperAdmin && (
                        <button className="btn-icon delete" onClick={() => handleDelete(s._id)}>🗑️</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {totalPages > 1 && (
              <div className="pagination-container">
                <button className="btn-pagination" onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))} disabled={currentPage === 1}>
                  Previous
                </button>
                {getPageNumbers().map(num => (
                  <button
                    key={num}
                    className="btn-pagination"
                    onClick={() => setCurrentPage(num)}
                    style={{
                      width: '38px', height: '38px', padding: 0,
                      background: currentPage === num ? 'var(--secondary)' : '#fff',
                      color: currentPage === num ? 'white' : 'var(--text-primary)',
                      fontWeight: 'bold',
                    }}
                  >
                    {num}
                  </button>
                ))}
                <button className="btn-pagination" onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))} disabled={currentPage === totalPages}>
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
              For: <strong>{selectedScholar?.title}</strong>
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
                      placeholder="admin@scholarship.org"
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
                    style={{ padding: '10px 20px', borderRadius: '10px', background: 'var(--secondary)', color: '#fff', border: 'none', fontWeight: 700, cursor: 'pointer' }}
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
