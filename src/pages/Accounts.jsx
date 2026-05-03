import { useState, useEffect } from 'react';
import API from '../api';

const ITEMS_PER_PAGE = 10;
const normalizeAccountType = (account) => (account?.type || account?.role || '').toLowerCase();

export default function Accounts() {
  const [accounts, setAccounts] = useState([]);
  const [loadingList, setLoadingList] = useState(true);

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);

  // Add Form
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formType, setFormType] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  // Edit Modal
  const [editAccount, setEditAccount] = useState(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editType, setEditType] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState('');

  const fetchAccounts = () => {
    setLoadingList(true);
    API.get('/accounts')
      .then((res) => {
        const list = (res.data.data || []).map((account) => ({
          ...account,
          type: normalizeAccountType(account),
        }));
        setAccounts(list);
      })
      .catch(() => setAccounts([]))
      .finally(() => setLoadingList(false));
  };

  useEffect(() => { fetchAccounts(); }, []);

  // Filter + Search
  const filtered = accounts.filter((a) => {
    const accountType = normalizeAccountType(a);
    const matchType = !filterType || accountType === filterType;
    const matchSearch = !searchTerm ||
      a.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.email?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchType && matchSearch;
  });

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const paginated = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  const handleFilterChange = (val) => { setFilterType(val); setCurrentPage(1); };
  const handleSearchChange = (val) => { setSearchTerm(val); setCurrentPage(1); };

  // Add Account
  const resetForm = () => {
    setFormName(''); setFormEmail(''); setFormPassword('');
    setFormType(''); setFormError(''); setShowForm(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formType) { setFormError('Please select a type.'); return; }
    setSubmitting(true); setFormError('');
    try {
      await API.post('/accounts', { name: formName, email: formEmail, password: formPassword, type: formType });
      resetForm();
      fetchAccounts();
    } catch (err) {
      setFormError(err.response?.data?.message || 'Failed to create account.');
    } finally { setSubmitting(false); }
  };

  // Edit Account
  const openEdit = (acc) => {
    setEditAccount(acc);
    setEditName(acc.name);
    setEditEmail(acc.email);
    setEditType(normalizeAccountType(acc));
    setEditPassword('');
    setEditError('');
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    setEditSubmitting(true); setEditError('');
    try {
      const payload = { name: editName, email: editEmail, type: editType };
      if (editPassword.trim()) payload.password = editPassword;
      await API.put(`/accounts/${editAccount._id}`, payload);
      setEditAccount(null);
      fetchAccounts();
    } catch (err) {
      setEditError(err.response?.data?.message || 'Failed to update account.');
    } finally { setEditSubmitting(false); }
  };

  // Delete
  const handleDelete = async (id) => {
    if (!confirm('Delete this account?')) return;
    try { await API.delete(`/accounts/${id}`); fetchAccounts(); }
    catch { alert('Failed to delete account.'); }
  };

  return (
    <div style={{ padding: '32px 24px', maxWidth: 1000, margin: '0 auto' }}>

      {/* Edit Modal */}
      {editAccount && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)',
          zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: 'var(--bg-card)', borderRadius: 16, padding: '32px 28px',
            width: '100%', maxWidth: 480,
            boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 22 }}>
              ✏️ Edit Account
            </h3>
            <form onSubmit={handleEditSubmit}>
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>Name *</label>
                <input value={editName} onChange={(e) => setEditName(e.target.value)} required style={inputStyle} />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>Email *</label>
                <input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} required style={inputStyle} />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>New Password <span style={{ fontWeight: 400, textTransform: 'none', fontSize: 11, color: 'var(--text-secondary)' }}>(leave blank to keep current)</span></label>
                <input type="password" value={editPassword} onChange={(e) => setEditPassword(e.target.value)} placeholder="Enter new password..." minLength={6} style={inputStyle} />
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={labelStyle}>Type *</label>
                <select value={editType} onChange={(e) => setEditType(e.target.value)} required style={inputStyle}>
                  <option value="university">🏛️ University</option>
                  <option value="scholarship">🎓 Scholarship</option>
                </select>
              </div>
              {editError && <p style={{ color: '#e53e3e', fontSize: 13, marginBottom: 12 }}>⚠️ {editError}</p>}
              <div style={{ display: 'flex', gap: 12 }}>
                <button type="submit" disabled={editSubmitting} style={{
                  flex: 1, padding: '11px 0',
                  background: 'linear-gradient(135deg, var(--primary), var(--secondary))',
                  color: '#fff', border: 'none', borderRadius: 9, fontSize: 14, fontWeight: 600, cursor: 'pointer',
                }}>
                  {editSubmitting ? '⏳ Saving...' : '💾 Save Changes'}
                </button>
                <button type="button" onClick={() => setEditAccount(null)} style={{
                  padding: '11px 20px', background: 'transparent', color: 'var(--text-secondary)',
                  border: '1.5px solid var(--border)', borderRadius: 9, fontSize: 14, fontWeight: 600, cursor: 'pointer',
                }}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Page Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>💼 Accounts</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Manage accounts for universities and scholarships.</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} style={{
          padding: '10px 20px',
          background: 'linear-gradient(135deg, var(--primary), var(--secondary))',
          color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600,
          cursor: 'pointer', boxShadow: '0 4px 12px rgba(108,99,255,0.25)',
        }}>
          {showForm ? '✕ Cancel' : '＋ Add Account'}
        </button>
      </div>

      {/* Add Form */}
      {showForm && (
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 14, padding: '28px 24px', marginBottom: 24,
          boxShadow: '0 4px 20px rgba(0,0,0,0.07)',
        }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 20 }}>🆕 New Account</h3>
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 14 }}>
              <div>
                <label style={labelStyle}>Name *</label>
                <input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g. John Doe" required style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Email *</label>
                <input
                  type="email"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  placeholder="john@example.com"
                  required
                  style={inputStyle}
                  autoComplete="new-email"
                  name="user-email-field"
                />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 20 }}>
              <div>
                <label style={labelStyle}>Password *</label>
                <input
                  type="password"
                  value={formPassword}
                  onChange={(e) => setFormPassword(e.target.value)}
                  placeholder="Min 6 characters"
                  required
                  autoComplete="new-password"
                  name="user-password-field"
                  minLength={6}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Type *</label>
                <select value={formType} onChange={(e) => setFormType(e.target.value)} required style={inputStyle}>
                  <option value="">— Select Type —</option>
                  <option value="university">🏛️ University</option>
                  <option value="scholarship">🎓 Scholarship</option>
                </select>
              </div>
            </div>
            {formError && <p style={{ color: '#e53e3e', fontSize: 13, marginBottom: 12 }}>⚠️ {formError}</p>}
            <div style={{ display: 'flex', gap: 12 }}>
              <button type="submit" disabled={submitting} style={{
                padding: '10px 24px',
                background: 'linear-gradient(135deg, var(--primary), var(--secondary))',
                color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer',
              }}>
                {submitting ? '⏳ Creating...' : '✅ Create Account'}
              </button>
              <button type="button" onClick={resetForm} style={{
                padding: '10px 20px', background: 'transparent', color: 'var(--text-secondary)',
                border: '1.5px solid var(--border)', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer',
              }}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Stats Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 20 }}>
        {[
          { label: 'Total Accounts', value: filtered.length, icon: '💼', color: 'var(--primary)', bg: 'rgba(108,99,255,0.08)' },
          { label: 'University', value: filtered.filter(a => normalizeAccountType(a) === 'university').length, icon: '🏛️', color: '#00b894', bg: 'rgba(0,184,148,0.08)' },
          { label: 'Scholarship', value: filtered.filter(a => normalizeAccountType(a) === 'scholarship').length, icon: '🎓', color: 'var(--secondary)', bg: 'rgba(247,37,133,0.08)' },
        ].map((s) => (
          <div key={s.label} style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 12, padding: '16px 20px',
            display: 'flex', alignItems: 'center', gap: 14,
            boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
          }}>
            <div style={{
              width: 44, height: 44, borderRadius: 11,
              background: s.bg, display: 'flex',
              alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0,
            }}>{s.icon}</div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3, fontWeight: 500 }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filter + Search Bar */}
      <div style={{
        display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap',
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 12, padding: '14px 16px',
      }}>
        <select value={filterType} onChange={(e) => handleFilterChange(e.target.value)} style={{
          ...inputStyle, width: 'auto', minWidth: 180, flex: '0 0 auto',
        }}>
          <option value="">All Types</option>
          <option value="university">🏛️ University</option>
          <option value="scholarship">🎓 Scholarship</option>
        </select>
        <input
          value={searchTerm}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="🔍 Search by name or email..."
          style={{ ...inputStyle, flex: 1, minWidth: 200 }}
        />
        {(searchTerm || filterType) && (
          <button onClick={() => { setSearchTerm(''); setFilterType(''); setCurrentPage(1); }} style={{
            padding: '10px 16px', background: 'rgba(0,0,0,0.05)',
            border: '1.5px solid var(--border)', borderRadius: 9,
            color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>✕ Clear</button>
        )}
      </div>

      {/* Table */}
      <div className="table-scroll-wrap" style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 14, boxShadow: '0 2px 12px rgba(0,0,0,0.05)',
      }}>
        {loadingList ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-secondary)' }}>⏳ Loading accounts...</div>
        ) : paginated.length === 0 ? (
          <div style={{ padding: 64, textAlign: 'center', color: 'var(--text-secondary)' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
            <p style={{ fontWeight: 600, fontSize: 15 }}>{filtered.length === 0 && accounts.length > 0 ? 'No results found' : 'No accounts yet'}</p>
            <p style={{ fontSize: 13, marginTop: 4 }}>{accounts.length === 0 ? 'Click "Add Account" to create one.' : 'Try a different search or filter.'}</p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'rgba(0,0,0,0.03)', borderBottom: '1px solid var(--border)' }}>
                {['#', 'Name', 'Email', 'Type', 'Linked To', 'Actions'].map((h) => (
                  <th key={h} style={{
                    padding: '12px 16px', fontSize: 11, fontWeight: 700,
                    color: 'var(--text-secondary)', textTransform: 'uppercase',
                    letterSpacing: '0.6px', textAlign: h === '#' ? 'center' : 'left',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginated.map((acc, idx) => (
                <tr key={acc._id}
                  style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.15s' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(0,0,0,0.02)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      width: 28, height: 28, background: 'rgba(108,99,255,0.1)',
                      color: 'var(--primary)', borderRadius: 6, fontSize: 12, fontWeight: 700,
                    }}>{(currentPage - 1) * ITEMS_PER_PAGE + idx + 1}</span>
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: 10,
                        background: 'linear-gradient(135deg, var(--primary), var(--secondary))',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#fff', fontSize: 14, fontWeight: 700, flexShrink: 0,
                      }}>{acc.name?.charAt(0).toUpperCase()}</div>
                      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{acc.name}</span>
                    </div>
                  </td>
                  <td style={{ padding: '14px 16px', fontSize: 13, color: 'var(--text-secondary)' }}>{acc.email}</td>
                  <td style={{ padding: '14px 16px' }}>
                    <span style={{
                      fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 20,
                      background: normalizeAccountType(acc) === 'admin' ? 'rgba(99,102,241,0.1)' : 
                                 normalizeAccountType(acc) === 'university' ? 'rgba(108,99,255,0.1)' : 'rgba(247,37,133,0.1)',
                      color: normalizeAccountType(acc) === 'admin' ? '#6366F1' :
                             normalizeAccountType(acc) === 'university' ? 'var(--primary)' : 'var(--secondary)',
                    }}>
                      {normalizeAccountType(acc) === 'admin' ? '👤 Admin' :
                       normalizeAccountType(acc) === 'university' ? '🏛️ University' : '🎓 Scholarship'}
                    </span>
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>
                        {acc.associatedName || <span style={{ color: 'var(--text-secondary)', fontStyle: 'italic', fontSize: 11 }}>General Admin</span>}
                    </div>
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => openEdit(acc)} style={{
                        padding: '6px 14px', background: 'rgba(108,99,255,0.08)',
                        color: 'var(--primary)', border: '1px solid rgba(108,99,255,0.2)',
                        borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      }}>✏️ Edit</button>
                      <button onClick={() => handleDelete(acc._id)} style={{
                        padding: '6px 14px', background: 'rgba(229,62,62,0.08)',
                        color: '#e53e3e', border: '1px solid rgba(229,62,62,0.2)',
                        borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      }}>🗑️ Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 20 }}>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, filtered.length)} of {filtered.length}
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1} style={pgBtn(currentPage === 1)}>← Prev</button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <button key={p} onClick={() => setCurrentPage(p)} style={pgBtn(false, p === currentPage)}>{p}</button>
            ))}
            <button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} style={pgBtn(currentPage === totalPages)}>Next →</button>
          </div>
        </div>
      )}
    </div>
  );
}

const labelStyle = {
  display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)',
  marginBottom: 7, textTransform: 'uppercase', letterSpacing: '0.6px',
};

const inputStyle = {
  width: '100%', padding: '11px 14px', border: '1.5px solid var(--border)',
  borderRadius: 9, background: 'var(--bg-input)', color: 'var(--text-primary)',
  fontSize: 14, outline: 'none', boxSizing: 'border-box',
};

const pgBtn = (disabled, active = false) => ({
  padding: '7px 12px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
  border: '1.5px solid var(--border)',
  background: active ? 'linear-gradient(135deg, var(--primary), var(--secondary))' : 'var(--bg-card)',
  color: active ? '#fff' : disabled ? 'var(--text-secondary)' : 'var(--text-primary)',
  opacity: disabled ? 0.4 : 1,
});
