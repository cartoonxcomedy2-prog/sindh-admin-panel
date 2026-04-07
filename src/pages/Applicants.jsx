import { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import API from '../api';
import imageCompression from 'browser-image-compression';
import { getStates, getCities } from '../data/locations';

const ALL_STATUSES = ['Applied', 'Admit Card', 'Test', 'Interview', 'Selected', 'Rejected'];
const ADMIN_COUNTRY = 'Pakistan';

const getFileUrl = (fileName) => {
  if (!fileName) return '';
  const raw = fileName.toString();
  const httpIdx = raw.indexOf('http://');
  const httpsIdx = raw.indexOf('https://');
  const realUrlIdx = (httpIdx !== -1 && (httpsIdx === -1 || httpIdx < httpsIdx)) ? httpIdx : httpsIdx;
  if (realUrlIdx !== -1) return raw.substring(realUrlIdx);
  return `${API.defaults.baseURL.replace('/api', '')}/uploads/${fileName}`;
};

export default function Applicants() {
  const { type, id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [targetName, setTargetName] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [filterState, setFilterState] = useState('');
  const [filterCity, setFilterCity] = useState('');
  const [programFilter, setProgramFilter] = useState(''); // New specific program filter
  const [selectedIds, setSelectedIds] = useState([]); // For bulk actions
  const [currentPage, setCurrentPage] = useState(1);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const itemsPerPage = 10;

  // Modal State
  const [showModal, setShowModal] = useState(false); // For Manage Universities (Scholarships)
  const [selectedApp, setSelectedApp] = useState(null);
  const [linkedUnivs, setLinkedUnivs] = useState([]);

  // New Student Details Modal State
  const [showStudentModal, setShowStudentModal] = useState(false);
  const [studentData, setStudentData] = useState(null);
  const [activeTab, setActiveTab] = useState('account');
  const [currentAppForModal, setCurrentAppForModal] = useState(null);

  const fetchApplicants = useCallback(async () => {
    setLoading(true);
    try {
      const res = await API.get(`/applications/${type}/${id}`);
      setData(res.data.data || []);
      
      const targetRes = await API.get(`/${type === 'university' ? 'universities' : 'scholarships'}/${id}`);
      const targetData = targetRes.data.data;
      setTargetName(targetData.name || targetData.title || 'Record');
      if (type === 'scholarship') {
        setLinkedUnivs(targetData.linkedUniversities || []);
      }
    } catch (err) {
      console.error(err);
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [type, id]);

  useEffect(() => {
    fetchApplicants();
  }, [fetchApplicants]);

  const handleStatusChange = async (appId, newStatus) => {
    try {
      await API.put(`/applications/${appId}`, { status: newStatus });
      setData(prev => prev.map(a => a._id === appId ? { ...a, status: newStatus } : a));
      if (selectedApp?._id === appId) setSelectedApp(prev => ({ ...prev, status: newStatus }));
      if (currentAppForModal?._id === appId) setCurrentAppForModal(prev => ({ ...prev, status: newStatus }));
    } catch {
      alert('Failed to update status');
    }
  };

  const handleFileUpload = async (appId, field, universityId = null) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,image/*';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      let uploadFile = file;

      // Compress if it's an image
      if (file.type.startsWith('image/')) {
        const options = {
          maxSizeMB: 1,
          maxWidthOrHeight: 1280,
          useWebWorker: true,
        };
        try {
          console.log('Compressing image document...');
          uploadFile = await imageCompression(file, options);
          console.log('Compression success:', uploadFile.size / 1024, 'KB');
        } catch (error) {
          console.error('Compression error:', error);
        }
      }

      const formData = new FormData();
      formData.append(field, uploadFile);
      if (universityId) formData.append('universityId', universityId);

      try {
        if (universityId) {
          const res = await API.put(`/applications/${appId}/university-status`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
          });
          setSelectedApp(res.data.data);
          setData(prev => prev.map(a => a._id === appId ? res.data.data : a));
        } else {
          const res = await API.put(`/applications/${appId}`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
          });
          setSelectedApp(res.data.data);
          setData(prev => prev.map(a => (a._id === appId || a._id === res.data.data?._id) ? res.data.data : a));
        }
        alert(`${field === 'admitCard' ? 'Admit Card' : 'Offer Letter'} uploaded!`);
      } catch (err) {
        console.error('Upload error:', err);
        alert('Upload failed: ' + (err.response?.data?.message || err.message));
      }
    };
    input.click();
  };

  const deleteApplication = async (appId) => {
    if (!window.confirm('Are you sure you want to delete this application?')) return;
    try {
      await API.delete(`/applications/${appId}`);
      setData(prev => prev.filter(a => a._id !== appId));
      alert('Application deleted');
    } catch {
      alert('Failed to delete application');
    }
  };

  const handleStudentUpdate = async () => {
    try {
      await API.put(`/users/${studentData._id}/profile`, { ...studentData, country: ADMIN_COUNTRY });
      alert('Profile updated');
      fetchApplicants();
    } catch {
      alert('Update failed');
    }
  };

  const handleDateUpdate = async (appId, field, value) => {
    try {
      const payload = {};
      payload[field] = value || null;
      const res = await API.put(`/applications/${appId}`, payload);
      setSelectedApp(res.data.data);
      setData(prev => prev.map(a => a._id === appId ? res.data.data : a));
    } catch (err) {
      alert('Failed to update date: ' + err.message);
    }
  };

  const handleDeleteAppDoc = async (appId, field) => {
    if (!window.confirm(`Delete ${field === 'admitCard' ? 'Admit Card' : 'Offer Letter'}?`)) return;
    try {
      const payload = {};
      payload[field] = null;
      const res = await API.put(`/applications/${appId}`, payload);
      setSelectedApp(res.data.data);
      setData(prev => prev.map(a => a._id === appId ? res.data.data : a));
      alert('Document deleted');
    } catch {
      alert('Delete failed');
    }
  };

  const handleDocUpload = async (section, field) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,image/*';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      let uploadFile = file;

      // Compress if it's an image
      if (file.type.startsWith('image/')) {
        const options = {
          maxSizeMB: 1,
          maxWidthOrHeight: 1280,
          useWebWorker: true,
        };
        try {
          console.log('Compressing education image...');
          uploadFile = await imageCompression(file, options);
        } catch (error) {
          console.error('Compression error:', error);
        }
      }

      const formData = new FormData();
      formData.append(field, uploadFile);
      formData.append('section', section);
      formData.append('field', field);

      try {
        const res = await API.put(`/users/${studentData._id}/education`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        setStudentData({ ...(res.data.data || {}), country: ADMIN_COUNTRY });
        alert('Document uploaded');
        fetchApplicants();
      } catch {
        alert('Upload failed');
      }
    };
    input.click();
  };

  const deleteDoc = async (section, field) => {
    if (!window.confirm(`Delete ${field} for ${section}?`)) return;
    try {
      await API.delete(`/users/${studentData._id}/education/${section}/${field}`);
      // Refetch user to show update
      const userRes = await API.get(`/users/${studentData._id}`);
      setStudentData({ ...(userRes.data.data || {}), country: ADMIN_COUNTRY });
      alert('Document deleted');
      fetchApplicants();
    } catch {
      alert('Delete failed');
    }
  };

  const handleUniStatusChange = async (appId, uniId, newStatus) => {
    try {
      const res = await API.put(`/applications/${appId}/university-status`, { 
        universityId: uniId, 
        status: newStatus 
      });
      setSelectedApp(res.data.data);
      setData(prev => prev.map(a => a._id === appId ? res.data.data : a));
    } catch {
      alert('Failed to update status');
    }
  };

  const toggleUniInApp = async (appId, uniId) => {
    const currentOffered = selectedApp.offeredUniversities || [];
    const isOffered = currentOffered.some(u => (u.university._id || u.university) === uniId);
    
    let newList;
    if (isOffered) {
      newList = currentOffered.filter(u => (u.university._id || u.university) !== uniId);
    } else {
      newList = [...currentOffered, { university: uniId, status: 'Applied' }];
    }

    try {
      const res = await API.put(`/applications/${appId}`, { offeredUniversities: newList });
      setSelectedApp(res.data.data);
      setData(prev => prev.map(a => a._id === appId ? res.data.data : a));
    } catch {
      alert('Failed to update universities');
    }
  };

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedIds(filteredData.map(app => app._id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectOne = (appId) => {
    setSelectedIds(prev => prev.includes(appId) 
      ? prev.filter(id => id !== appId) 
      : [...prev, appId]
    );
  };

  const handleBulkStatusUpdate = async (newStatus) => {
    if (!newStatus || selectedIds.length === 0) return;
    if (!window.confirm(`Update status to "${newStatus}" for ${selectedIds.length} selected applicants?`)) return;

    try {
      setLoading(true);
      await API.put('/applications/bulk-status', { ids: selectedIds, status: newStatus });
      setData(prev => prev.map(app => 
        selectedIds.includes(app._id) ? { ...app, status: newStatus } : app
      ));
      setSelectedIds([]);
      alert(`Updated ${selectedIds.length} applicants to ${newStatus}`);
    } catch (err) {
      console.error(err);
      alert('Bulk update failed');
    } finally {
      setLoading(false);
    }
  };

  // Filtering Logic - Optimized with useMemo
  const filteredData = useMemo(() => {
    return data.filter(app => {
      const matchesSearch = app.user?.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                           app.user?.email?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = !statusFilter || app.status === statusFilter;
      const applicantCountry = app.user?.country || ADMIN_COUNTRY;
      const matchesCountry = applicantCountry === ADMIN_COUNTRY;
      const matchesState = !filterState || app.user?.state === filterState;
      const matchesCity = !filterCity || app.user?.city === filterCity;
      const matchesProgram = !programFilter || app.selectedPrograms?.some(p => p.programName === programFilter);
      
      // Date Range Filter
      const appDate = new Date(app.appliedAt);
      const start = startDate ? new Date(startDate) : null;
      const end = endDate ? new Date(endDate) : null;
      
      if (start) {
        start.setHours(0, 0, 0, 0);
        if (appDate < start) return false;
      }
      if (end) {
        end.setHours(23, 59, 59, 999);
        if (appDate > end) return false;
      }
      
      return matchesSearch && matchesStatus && matchesCountry && matchesState && matchesCity && matchesProgram;
    }).sort((a, b) => new Date(b.appliedAt) - new Date(a.appliedAt));
  }, [data, searchTerm, statusFilter, filterState, filterCity, programFilter, startDate, endDate]);

  // Get all unique programs for the dropdown - Optimized with useMemo
  const allPrograms = useMemo(() => {
    return [...new Set(data.flatMap(app => app.selectedPrograms?.map(p => p.programName) || []))].sort();
  }, [data]);


  // Pagination Calculation
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

  const filterSelectStyle = {
    padding: '10px',
    borderRadius: '8px',
    border: '1px solid var(--border)',
    background: 'var(--bg-card)', 
    color: 'var(--text-primary)',
    minWidth: '130px',
    outline: 'none',
    fontSize: '13px'
  };

  const dateInputStyle = {
    padding: '8px',
    borderRadius: '6px',
    border: '1px solid #e2e8f0',
    background: 'white',
    fontSize: '12px',
    outline: 'none',
    color: '#1e293b'
  };

  const getPersonalInfo = (student) => student?.education?.personalInfo || {};

  const renderIdentityBlock = () => {
    if (!studentData) return null;
    const personalInfo = getPersonalInfo(studentData);
    return (
      <div className="identity-summary" style={{ 
        marginBottom: 25, 
        padding: '24px 30px', 
        background: '#ffffff', border: '1px solid #e2e8f0', 
        color: '#1e293b', borderRadius: 24,
        display: 'flex',
        flexWrap: 'wrap',
        gap: '24px 40px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        position: 'relative',
        overflow: 'hidden'
      }}>
        
        
        <div className="id-item" style={{ flex: '1 1 250px' }}>
          <label style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', fontWeight: 800, display: 'block', marginBottom: 8, letterSpacing: 0.8 }}>Applying For</label>
          <div style={{ fontWeight: 800, fontSize: 18, color: '#1e293b' }}>
             {currentAppForModal?.type === 'University' ? '🏛️ ' : '🎓 '}
             {currentAppForModal?.university?.name || currentAppForModal?.scholarship?.title || 'Unknown Entity'}
          </div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 4, fontWeight: 600 }}>
             {currentAppForModal?.type} Application
          </div>
        </div>

        <div className="id-item">
          <label style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', fontWeight: 800, display: 'block', marginBottom: 8, letterSpacing: 0.8 }}>Student Details</label>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{studentData.name}</div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Father: {personalInfo.fatherName || studentData.fatherName || 'N/A'}</div>
        </div>

        <div className="id-item">
          <label style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', fontWeight: 800, display: 'block', marginBottom: 8, letterSpacing: 0.8 }}>Contact Info</label>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{studentData.phone || 'N/A'}</div>
          <div style={{ fontWeight: 600, fontSize: 11, color: '#64748b' }}>{studentData.email}</div>
        </div>

        <div className="id-item">
          <label style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', fontWeight: 800, display: 'block', marginBottom: 8, letterSpacing: 0.8 }}>Region</label>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{studentData.city || 'N/A'}, {studentData.country || ADMIN_COUNTRY}</div>
        </div>
      </div>
    );
  };

  const renderEducationSection = (title, section, fields) => {
    const eduData = studentData?.education?.[section] || {};
    const personalInfo = getPersonalInfo(studentData);
    return (
      <div key={section} className="edu-mgmt-section" style={{ 
        marginBottom: 30, 
        padding: 28, 
        background: '#ffffff', 
        borderRadius: 20,
        border: '1px solid #eef2f6',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 25, paddingBottom: 15, borderBottom: '1.5px solid #f1f5f9' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
               {section === 'nationalId' ? '👤' : '📜'}
            </div>
            <h4 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#1e293b' }}>
              {section === 'nationalId' ? 'Identity & Profile' : title}
            </h4>
          </div>
          {eduData.enabled && <span className="badge badge-active" style={{ fontSize: 11, padding: '4px 12px', borderRadius: 8, background: '#dcfce7', color: '#166534' }}>Verified Section</span>}
        </div>

        {/* Text Details first */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 15, marginBottom: 20 }}>
          {section === 'nationalId' && (
            <>
              <div className="info-field">
                <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Country Lived</label>
                <div style={{ fontWeight: 600 }}>{studentData.country || ADMIN_COUNTRY}</div>
              </div>
              <div className="info-field">
                <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>State Lived</label>
                <div style={{ fontWeight: 600 }}>{studentData.state || 'Not provided'}</div>
              </div>
              <div className="info-field">
                <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>City Lived</label>
                <div style={{ fontWeight: 600 }}>{studentData.city || 'Not provided'}</div>
              </div>
              <div className="info-field">
                <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Home Address</label>
                <div style={{ fontWeight: 600 }}>{studentData.address || 'Not provided'}</div>
              </div>
              <div style={{ gridColumn: '1 / -1' }}><hr style={{ opacity: 0.1, margin: '10px 0' }} /></div>
              <div className="info-field">
                <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>National ID Issuing Country</label>
                <div style={{ fontWeight: 600 }}>{eduData.country || 'Not provided'}</div>
              </div>
              <div className="info-field">
                <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>NIC / ID Number</label>
                <div style={{ fontWeight: 600 }}>{personalInfo.cnicNumber || eduData.idNumber || 'Not provided'}</div>
              </div>
              <div className="info-field">
                <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Father Name</label>
                <div style={{ fontWeight: 600 }}>{personalInfo.fatherName || studentData.fatherName || 'Not provided'}</div>
              </div>
              <div className="info-field">
                <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Father Contact Number</label>
                <div style={{ fontWeight: 600 }}>{personalInfo.fatherContactNumber || 'Not provided'}</div>
              </div>
              <div className="info-field">
                <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Father CNIC Number</label>
                <div style={{ fontWeight: 600 }}>{personalInfo.fatherCnicNumber || 'Not provided'}</div>
              </div>
              <div className="info-field">
                <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Date of Birth</label>
                <div style={{ fontWeight: 600 }}>{personalInfo.dateOfBirth || studentData.dateOfBirth || 'Not provided'}</div>
              </div>
            </>
          )}
          
          {(section === 'matric' || section === 'intermediate' || section === 'bachelor' || section === 'masters' || section === 'phd') && (
            <>
              <div className="info-field">
                <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                  {section === 'matric' || section === 'intermediate' ? 'School/College' : 'Degree Name'}
                </label>
                <div style={{ fontWeight: 600 }}>{eduData.schoolName || eduData.collegeName || eduData.degreeName || 'N/A'}</div>
              </div>
              <div className="info-field">
                <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Passing Year</label>
                <div style={{ fontWeight: 600 }}>{eduData.passingYear || 'N/A'}</div>
              </div>
              <div className="info-field">
                <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Grade / CGPA</label>
                <div style={{ fontWeight: 600, color: 'var(--success)' }}>{eduData.grade || 'N/A'}</div>
              </div>
            </>
          )}

          {section === 'international' && (
            <>
              <div className="info-field">
                <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Passport Number</label>
                <div style={{ fontWeight: 600 }}>{eduData.passportNumber || 'N/A'}</div>
              </div>
              <div className="info-field">
                <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>English Test</label>
                <div style={{ fontWeight: 600 }}>{eduData.englishTestType || 'N/A'} (Score: {eduData.testScore || '0'})</div>
              </div>
            </>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20 }}>
          {fields.map(f => {
            const fileName = f.isPersonalInfo ? (studentData?.education?.personalInfo?.[f.key]) : eduData[f.key];
            const displayLabel = `${studentData?.name}_${title}_${f.label}`.replace(/\s+/g, '_');
            return (
              <div key={f.key} className="doc-tile" style={{ padding: '20px', 
                borderRadius: '16px', 
                border: '1px solid #e2e8f0',
                transition: 'all 0.3s ease',
                position: 'relative'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 15 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ fontSize: 24 }}>{fileName ? '📄' : '⭕'}</div>
                    <div>
                        <div style={{ fontSize: 13, fontWeight: 800, color: '#1e293b' }}>{f.label}</div>
                        <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>{section.toUpperCase()}</div>
                    </div>
                  </div>
                  <span style={{ 
                    fontSize: 10, 
                    padding: '4px 8px', 
                    borderRadius: 6, 
                    fontWeight: 700,
                    background: fileName ? '#dcfce7' : '#fee2e2',
                    color: fileName ? '#166534' : '#991b1b'
                  }}>
                    {fileName ? 'UPLOADED' : 'MISSING'}
                  </span>
                </div>

                {fileName ? (
                  <>
                    <div style={{ 
                      fontSize: 11, 
                      color: '#475569', 
                      marginBottom: 15, 
                      padding: '8px', 
                      background: '#fff', 
                      borderRadius: 8, 
                      border: '1px solid #dae1e7',
                      wordBreak: 'break-all',
                      fontWeight: 500 
                    }}>
                      {displayLabel}.pdf
                    </div>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <a 
                        href={getFileUrl(fileName)} 
                        target="_blank" 
                        rel="noreferrer" 
                        className="btn-action" 
                        style={{ 
                          flex: 1,
                          padding: '8px',
                          background: 'white',
                          border: '1px solid #cbd5e1',
                          borderRadius: '8px',
                          color: '#1e293b',
                          fontSize: 12,
                          fontWeight: 700,
                          textAlign: 'center',
                          textDecoration: 'none',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 6
                        }}
                      >
                        👁️ View
                      </a>
                      <button 
                        onClick={() => handleDocUpload(section, f.key)}
                        style={{ padding: '8px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '8px', cursor: 'pointer' }}
                        title="Replace"
                      >
                        🔄
                      </button>
                      <button 
                        onClick={() => deleteDoc(section, f.key)}
                        style={{ padding: '8px', background: '#fff1f2', border: '1px solid #fecaca', borderRadius: '8px', cursor: 'pointer' }}
                        title="Delete"
                      >
                        🗑️
                      </button>
                    </div>
                  </>
                ) : (
                  <button 
                    onClick={() => handleDocUpload(section, f.key)}
                    style={{ 
                      width: '100%', 
                      padding: '10px', 
                      background: 'white', 
                      border: '2px dashed #cbd5e1', 
                      borderRadius: '12px',
                      color: '#64748b',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                    onMouseOver={(e) => { e.target.style.borderColor = 'var(--primary)'; e.target.style.color = 'var(--primary)'; }}
                    onMouseOut={(e) => { e.target.style.borderColor = '#cbd5e1'; e.target.style.color = '#64748b'; }}
                  >
                    + Upload {f.label}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="applicants-page" style={{ padding: '0', width: '100%', maxWidth: 'none' }}>
      <div className="table-card" style={{ border: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', background: 'transparent', width: '100%', margin: 0 }}>
        <div className="table-header" style={{ 
          flexDirection: 'column', 
          alignItems: 'flex-start', 
          gap: '16px', 
          padding: '24px', 
          background: '#ffffff', 
          borderRadius: '20px 20px 0 0',
          borderBottom: '1px solid var(--border)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 15 }}>
              
              <div>
                <h2>👥 Applicants List</h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
                    Managing students for: <strong style={{ color: '#000000', fontWeight: 900 }}>{targetName}</strong>
                  </p>
                  <div style={{ display: 'flex', gap: 8, fontSize: 11 }}>
                    <span style={{ background: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: '5px', fontWeight: 700 }}>Selected: {data.filter(a => a.status === 'Selected').length}</span>
                    <span style={{ background: '#fee2e2', color: '#991b1b', padding: '2px 8px', borderRadius: '5px', fontWeight: 700 }}>Rejected: {data.filter(a => a.status === 'Rejected').length}</span>
                    <span style={{ background: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: '5px', fontWeight: 700 }}>Applied: {data.filter(a => a.status === 'Applied').length}</span>
                  </div>
                </div>
              </div>
            </div>
            <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>Total Results: {filteredData.length}</span>
          </div>

          <div className="filter-bar" style={{ 
            display: 'flex', 
            flexWrap: 'wrap', 
            gap: '12px', 
            width: '100%', 
            padding: '16px 0 0 0', 
            background: 'transparent',
            border: 'none',
            borderRadius: '0',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
          }}>
            <div className="search-input-group" style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
                <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }}>🔍</span>
                <input 
                    type="text" 
                    placeholder="Search name or email..." 
                    value={searchTerm}
                    onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                    style={{ width: '100%', padding: '12px 12px 12px 40px', borderRadius: '10px', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: '14px', outline: 'none' }}
                />
            </div>

            <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }} style={filterSelectStyle}>
                <option value="" style={{ background: 'var(--bg-card)' }}>All Statuses</option>
                {ALL_STATUSES.map(s => <option key={s} value={s} style={{ background: 'var(--bg-card)' }}>{s}</option>)}
            </select>

            <select value={filterState} onChange={(e) => { setFilterState(e.target.value); setFilterCity(''); setCurrentPage(1); }} style={filterSelectStyle}>
                <option value="" style={{ background: 'var(--bg-card)' }}>All States</option>
                {getStates(ADMIN_COUNTRY).map(s => <option key={s} value={s} style={{ background: 'var(--bg-card)' }}>{s}</option>)}
            </select>

            <select value={filterCity} onChange={(e) => { setFilterCity(e.target.value); setCurrentPage(1); }} disabled={!filterState} style={{ ...filterSelectStyle, opacity: !filterState ? 0.5 : 1 }}>
                <option value="" style={{ background: 'var(--bg-card)' }}>All Cities</option>
                {getCities(ADMIN_COUNTRY, filterState).map(c => <option key={c} value={c} style={{ background: 'var(--bg-card)' }}>{c}</option>)}
            </select>


              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', borderRadius: '10px', border: '1px solid var(--border)' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Applied:</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <span style={{ fontSize: '11px', color: '#94a3b8' }}>From</span>
                    <input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setCurrentPage(1); }} style={dateInputStyle} title="Start Date" />
                    <span style={{ fontSize: '11px', color: '#94a3b8' }}>To</span>
                    <input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setCurrentPage(1); }} style={dateInputStyle} title="End Date" />
                    {(startDate || endDate) && (
                      <button 
                        onClick={() => { setStartDate(''); setEndDate(''); }} 
                        style={{ border: 'none', background: 'none', color: '#ef4444', fontSize: '14px', cursor: 'pointer', padding: '0 5px' }}
                        title="Reset Dates"
                      >
                        ✕
                      </button>
                    )}
                  </div>
              </div>

            <select value={programFilter} onChange={(e) => { setProgramFilter(e.target.value); setCurrentPage(1); }} style={filterSelectStyle}>
                <option value="">All Programs</option>
                {allPrograms.map(p => <option key={p} value={p}>{p}</option>)}
            </select>

            {selectedIds.length > 0 && (
              <div className="bulk-actions" style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '20px', 
                padding: '12px 24px', 
                background: '#ffffff', 
                borderRadius: '12px',
                border: '1px solid #e2e8f0',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                animation: 'slideDown 0.3s ease-out'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#4f46e5' }}></div>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: '#1e293b' }}>{selectedIds.length} Selected</span>
                </div>
                
                <div style={{ height: '24px', width: '1px', background: '#e2e8f0' }}></div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 500 }}>Bulk Action:</span>
                  <select 
                    onChange={(e) => handleBulkStatusUpdate(e.target.value)}
                    style={{ 
                      padding: '8px 16px', 
                      borderRadius: '8px', 
                      border: '1px solid #e2e8f0', 
                      color: '#1e293b',
                      fontWeight: 600,
                      fontSize: '13px',
                      outline: 'none',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                    defaultValue=""
                  >
                    <option value="" disabled>Update Status to...</option>
                    {ALL_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                <button 
                  onClick={() => setSelectedIds([])}
                  style={{ 
                    background: 'transparent', 
                    border: 'none', 
                    color: '#64748b', 
                    fontSize: '13px', 
                    cursor: 'pointer', 
                    fontWeight: 600, 
                    padding: '8px 12px', 
                    borderRadius: '8px',
                    transition: 'all 0.2s',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                  onMouseOver={(e) => e.target.style.color = '#ef4444'}
                  onMouseOut={(e) => e.target.style.color = '#64748b'}
                >
                  ✕ Clear Selection
                </button>
              </div>
            )}
          </div>
        </div>

            <div style={{ background: '#ffffff', borderRadius: '0 0 20px 20px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              {loading ? (
                <div className="loading"><div className="spinner"></div> Loading...</div>
              ) : filteredData.length === 0 ? (
                <div className="empty-msg">No applicants found matching your criteria.</div>
              ) : (
                <>
                  <div style={{ width: '100%', overflowX: 'auto' }}>
                  <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'separate', borderSpacing: '0' }}>
              <thead>
                <tr>
                   <th style={{ padding: '10px 12px', width: '80px' }}>
                     <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input 
                          type="checkbox" 
                          onChange={handleSelectAll} 
                          checked={selectedIds.length > 0 && selectedIds.length === filteredData.length}
                          style={{ cursor: 'pointer', width: '16px', height: '16px', accentColor: '#4f46e5' }}
                        />
                        <span>#</span>
                     </div>
                   </th>
                   <th style={{ padding: '10px 12px', minWidth: '150px' }}>Student Info</th>
                  
                  <th style={{ padding: '10px 12px' }}>State</th>
                  <th style={{ padding: '10px 12px' }}>City</th>
                  <th style={{ padding: '10px 12px', minWidth: '200px' }}>Programs / Level</th>
                  <th style={{ padding: '10px 12px' }}>Status</th>
                  <th style={{ padding: '10px 12px' }}>Applied On</th>
                  <th style={{ textAlign: 'center', padding: '10px 12px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {currentItems.map((app, index) => {
                  const serialNumber = indexOfFirstItem + index + 1;
                  return (
                    <tr key={app._id} style={{ 
                      background: selectedIds.includes(app._id) ? '#f8fafc' : 'transparent',
                      transition: 'background 0.2s'
                    }}>
                    <td style={{ padding: '10px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <input 
                            type="checkbox" 
                            checked={selectedIds.includes(app._id)}
                            onChange={() => handleSelectOne(app._id)}
                            style={{ cursor: 'pointer', width: '16px', height: '16px', accentColor: '#4f46e5' }}
                          />
                          <span style={{ color: 'var(--text-secondary)', fontWeight: '800', fontSize: '13px' }}>{serialNumber}</span>
                        </div>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ wordBreak: 'break-word', maxWidth: '200px' }}>
                          <div style={{ fontWeight: 'bold', fontSize: '12px', color: '#000000', lineHeight: '1.2' }}>{app.user?.name || 'Unknown User'}</div>
                          <div style={{ fontSize: '10px', color: '#4b5563', marginTop: '2px' }}>{app.user?.email}</div>
                        </div>
                      </td>
                      
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ fontSize: 11, color: '#000000' }}>{app.user?.state || 'N/A'}</div>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ fontSize: 11, color: '#000000' }}>{app.user?.city || 'N/A'}</div>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ wordBreak: 'break-word', minWidth: '180px' }}>
                          <div style={{ fontWeight: 600, fontSize: '11px', color: '#374151' }}>{app.scholarship?.title || app.university?.name}</div>
                          <div style={{ display: 'flex', gap: '6px', marginTop: '6px', flexWrap: 'wrap' }}>
                            {app.selectedPrograms?.map((p, idx) => (
                              <span key={idx} style={{ 
                                fontSize: 10, 
                                padding: '0', 
                                background: 'none',
                                border: 'none', 
                                color: 'var(--primary)',
                                fontWeight: 600,
                                whiteSpace: 'nowrap'
                              }}>
                                {idx > 0 ? ', ' : ''}{p.programName}
                              </span>
                            ))}
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <select 
                          value={app.status} 
                          onChange={(e) => handleStatusChange(app._id, e.target.value)}
                          style={{ 
                            padding: '6px 10px', 
                            borderRadius: 8, 
                            background: app.status === 'Selected' ? '#dcfce7' : 
                                       app.status === 'Rejected' ? '#fee2e2' : 
                                       app.status === 'Interview' ? '#e0e7ff' :
                                       app.status === 'Test' ? '#fef3c7' : '#f1f5f9',
                            color: app.status === 'Selected' ? '#166534' : 
                                   app.status === 'Rejected' ? '#991b1b' : 
                                   app.status === 'Interview' ? '#3730a3' :
                                   app.status === 'Test' ? '#92400e' : '#475569',
                            fontSize: '11px',
                            fontWeight: 800,
                            cursor: 'pointer',
                            outline: 'none',
                            transition: 'all 0.2s'
                          }}
                        >
                          {ALL_STATUSES.map(s => <option key={s} value={s} style={{ background: '#fff', color: '#000' }}>{s}</option>)}
                        </select>
                      </td>
                      <td style={{ fontSize: 11, color: '#000000', padding: '10px 12px', fontWeight: '500' }}>
                        {new Date(app.appliedAt).toLocaleDateString()}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                          <button 
                            onClick={() => { 
                              setStudentData({ ...(app.user || {}), country: ADMIN_COUNTRY }); 
                              setCurrentAppForModal(app);
                              setShowStudentModal(true); 
                              setActiveTab('account'); 
                            }}
                            style={{ 
                              background: '#4F46E5', 
                              border: 'none', 
                              color: 'white', 
                              fontSize: '11px', 
                              padding: '4px 10px', 
                              borderRadius: '6px',
                              fontWeight: '600',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                          >
                            VIEW
                          </button>
                          <button 
                            onClick={() => { setSelectedApp(app); setShowModal(true); }}
                            style={{ 
                              background: '#10B981', 
                              border: 'none', 
                              color: 'white', 
                              fontSize: '11px', 
                              padding: '4px 10px', 
                              borderRadius: '6px',
                              fontWeight: '600',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                          >
                            STATUS
                          </button>
                          <button 
                            onClick={() => deleteApplication(app._id)}
                            style={{ 
                              background: '#fee2e2', 
                              border: 'none', 
                              color: '#ef4444', 
                              padding: '6px', 
                              borderRadius: '8px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              transition: 'all 0.2s',
                              width: '32px',
                              height: '32px'
                            }}
                            title="Delete"
                            onMouseOver={(e) => {
                              e.currentTarget.style.background = '#fecaca';
                              e.currentTarget.style.transform = 'scale(1.1)';
                            }}
                            onMouseOut={(e) => {
                              e.currentTarget.style.background = '#fee2e2';
                              e.currentTarget.style.transform = 'scale(1)';
                            }}
                          >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                              <line x1="10" y1="11" x2="10" y2="17"></line>
                              <line x1="14" y1="11" x2="14" y2="17"></line>
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>

            <div className="pagination-container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', padding: '20px', borderTop: '1px solid rgba(0,0,0,0.05)' }}>
              <button 
                className="btn-pagination" 
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer', opacity: currentPage === 1 ? 0.5 : 1 }}
              >
                Previous
              </button>

              {getPageNumbers().map(num => (
                <button
                  key={num}
                  onClick={() => setCurrentPage(num)}
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    background: currentPage === num ? 'var(--primary)' : 'transparent',
                    color: currentPage === num ? 'white' : 'var(--text-primary)',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    boxShadow: currentPage === num ? '0 4px 12px rgba(108,99,255,0.3)' : 'none',
                    transition: 'all 0.3s ease'
                  }}
                >
                  {num}
                </button>
              ))}

              <button 
                className="btn-pagination" 
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages || totalPages === 0}
                style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer', opacity: (currentPage === totalPages || totalPages === 0) ? 0.5 : 1 }}
              >
                Next
              </button>
            </div>
          </>
        )}
      </div>

      {showStudentModal && studentData && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '900px', width: '95%', maxHeight: '90vh', overflow: 'hidden' }}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', flexWrap: 'wrap', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 15 }}>
                <div className="admin-avatar" style={{ width: 50, height: 50, fontSize: 20, background: 'var(--primary)' }}>{studentData.name?.charAt(0)}</div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 18 }}>{studentData.name}</h3>
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>{studentData.email}</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: '#f1f5f9', padding: '4px 12px', borderRadius: '12px' }}>
                  <label style={{ fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Status:</label>
                  <select 
                    value={currentAppForModal?.status} 
                    onChange={(e) => handleStatusChange(currentAppForModal._id, e.target.value)}
                    style={{ 
                      padding: '6px 12px', 
                      borderRadius: '8px', 
                      background: currentAppForModal?.status === 'Selected' ? '#dcfce7' : 
                                 currentAppForModal?.status === 'Rejected' ? '#fee2e2' : 'transparent',
                      color: currentAppForModal?.status === 'Selected' ? '#166534' : 
                             currentAppForModal?.status === 'Rejected' ? '#991b1b' : '#1e293b',
                      fontSize: '13px',
                      fontWeight: 800,
                      border: 'none',
                      cursor: 'pointer',
                      outline: 'none'
                    }}
                  >
                    {ALL_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                <button 
                  onClick={async (e) => {
                    const btn = e.currentTarget;
                    const originalText = btn.textContent;
                    try {
                      btn.disabled = true;
                      btn.textContent = 'Bundling...';
                      const res = await API.get(`/applications/${currentAppForModal._id}/download-bundle`, {
                        responseType: 'blob'
                      });
                      const url = window.URL.createObjectURL(new Blob([res.data]));
                      const link = document.createElement('a');
                      link.href = url;
                      link.setAttribute('download', `${studentData.name.replace(/\s+/g, '_')}_Bundle.zip`);
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                    } catch (err) {
                      console.error('BUNDLE ERROR:', err);
                      alert('Download Failed.');
                    } finally {
                      btn.disabled = false;
                      btn.textContent = originalText;
                    }
                  }}
                  style={{
                    background: 'var(--primary)',
                    color: 'white', border: 'none', padding: '10px 18px', borderRadius: '12px',
                    fontSize: '13px', fontWeight: '700', cursor: 'pointer', display: 'flex',
                    alignItems: 'center', gap: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                    transition: 'all 0.3s ease', whiteSpace: 'nowrap'
                  }}
                >
                   <span>📥</span> Download Full Bundle (ZIP)
                </button>
                <button className="btn-close" onClick={() => setShowStudentModal(false)}>✕</button>
              </div>
            </div>
            
            <div className="modal-tabs" style={{ display: 'flex', borderBottom: '1px solid var(--border)', padding: '0 20px', gap: 30 }}>
              {['Account Info', 'Education Docs'].map(t => {
                const id = t.toLowerCase().split(' ')[0]; // Result: 'account' or 'education'
                return (
                  <button 
                    key={id} 
                    onClick={() => setActiveTab(id)}
                    style={{
                      padding: '15px 0',
                      background: 'none',
                      border: 'none',
                      borderBottom: activeTab === id ? '3px solid var(--primary)' : '3px solid transparent',
                      color: activeTab === id ? 'var(--primary)' : 'var(--text-secondary)',
                      fontWeight: activeTab === id ? 800 : 500,
                      cursor: 'pointer'
                    }}
                  >
                    {t}
                  </button>
                );
              })}
            </div>

            <div className="modal-body" style={{ maxHeight: 'calc(90vh - 150px)', overflowY: 'auto' }}>
              {activeTab === 'account' ? (
                <div style={{ padding: '24px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
                  <div className="form-group">
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 6, display: 'block' }}>Student Display Name (Username)</label>
                    <input 
                      type="text" 
                      value={studentData.name || ''} 
                      onChange={e => setStudentData({...studentData, name: e.target.value})} 
                      
                    />
                  </div>
                  <div className="form-group">
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 6, display: 'block' }}>Email Address</label>
                    <input 
                      type="email" 
                      value={studentData.email || ''} 
                      onChange={e => setStudentData({...studentData, email: e.target.value})} 
                      
                    />
                  </div>
                  <div className="form-group">
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase', marginBottom: 6, display: 'block' }}>Set New Password (Leave empty to keep current)</label>
                    <input 
                      type="password" 
                      placeholder="Enter at least 6 characters"
                      value={studentData.password || ''} 
                      onChange={e => setStudentData({...studentData, password: e.target.value})} 
                      
                    />
                  </div>
                  <div className="form-group">
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 6, display: 'block' }}>Phone Number</label>
                    <input 
                      type="text" 
                      value={studentData.phone || ''} 
                      onChange={e => setStudentData({...studentData, phone: e.target.value})} 
                      
                    />
                  </div>

                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 6, display: 'block' }}>Home Address</label>
                    <input 
                      type="text" 
                      placeholder="Street address, house number, etc."
                      value={studentData.address || ''} 
                      onChange={e => setStudentData({...studentData, address: e.target.value})} 
                      
                    />
                  </div>

                  <div className="form-group">
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 6, display: 'block' }}>Country</label>
                    <input
                      value={ADMIN_COUNTRY}
                      readOnly
                      
                    />
                  </div>
                  <div className="form-group">
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 6, display: 'block' }}>State / Province</label>
                    <select 
                      value={studentData.state || ''} 
                      onChange={e => setStudentData({...studentData, country: ADMIN_COUNTRY, state: e.target.value, city: ''})}
                      
                    >
                      <option value="">Select State</option>
                      {getStates(ADMIN_COUNTRY).map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 6, display: 'block' }}>City</label>
                    <select 
                      value={studentData.city || ''} 
                      onChange={e => setStudentData({...studentData, city: e.target.value})}
                      disabled={!studentData.state}
                      
                    >
                      <option value="">Select City</option>
                      {studentData.state && getCities(ADMIN_COUNTRY, studentData.state).map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>

                  <div style={{ gridColumn: '1 / -1', marginTop: 15, display: 'flex', justifyContent: 'flex-end' }}>
                    <button 
                      onClick={handleStudentUpdate}
                      style={{ 
                        padding: '12px 30px', 
                        background: 'var(--primary)', color: 'white', 
                        borderRadius: '12px', 
                        border: 'none', 
                        fontWeight: 800, 
                        fontSize: '14px', 
                        cursor: 'pointer',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.05)' 
                      }}
                    >
                      Update & Save Changes
                    </button>
                  </div>
                </div>
              ) : (
                <div className="education-mgmt">
                  {renderIdentityBlock()}
                  <div style={{ marginBottom: 25, padding: 20, borderRadius: 16, border: '1px solid var(--border)' }}>
                    <h4 style={{ margin: '0 0 12px 0', fontSize: 14 }}>Applied Programs & Priority:</h4>
                    <div style={{ display: 'grid', gap: 10 }}>
                      {currentAppForModal?.selectedPrograms?.sort((a, b) => (a.priority || 99) - (b.priority || 99)).map((p, idx) => (
                        <div key={idx} style={{ 
                          padding: '12px 18px', 
                          background: 'white', 
                          borderRadius: 12, 
                          border: '1px solid var(--primary-light)',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <span style={{ 
                              width: 28, height: 28, 
                              background: 'var(--primary)', color: 'white', 
                              borderRadius: '50%', 
                              display: 'flex', 
                              alignItems: 'center', 
                              justifyContent: 'center',
                              fontSize: 12,
                              fontWeight: 800
                            }}>
                              {p.priority || (idx + 1)}
                            </span>
                            <span style={{ fontWeight: 700, color: 'var(--primary)' }}>{p.programName}</span>
                          </div>
                          <div style={{ fontSize: 12, opacity: 0.6, fontWeight: 600 }}>Choice {p.priority || (idx + 1)}</div>
                         </div>
                      ))}
                    </div>
                  </div>

                  {renderEducationSection('National ID', 'nationalId', [
                    { key: 'file', label: 'Student ID Card' },
                    { key: 'fatherCnicFile', label: 'Father CNIC Card', isPersonalInfo: true }
                  ])}

                  {renderEducationSection('Matric / O-Level', 'matric', [
                    { key: 'transcript', label: 'Transcript' },
                    { key: 'certificate', label: 'Certificate' }
                  ])}

                  {renderEducationSection('Intermediate / A-Level', 'intermediate', [
                    { key: 'transcript', label: 'Transcript' },
                    { key: 'certificate', label: 'Certificate' }
                  ])}

                  {/* Always show higher-education sections in applicant education view */}
                  {renderEducationSection('Bachelor Degree', 'bachelor', [
                    { key: 'transcript', label: 'Transcript' },
                    { key: 'certificate', label: 'Certificate' }
                  ])}

                  {renderEducationSection('Masters / PhD Degree', 'masters', [
                    { key: 'transcript', label: 'Transcript' },
                    { key: 'certificate', label: 'Certificate' }
                  ])}

                  {(studentData?.education?.phd?.degreeName ||
                    studentData?.education?.phd?.transcript ||
                    studentData?.education?.phd?.certificate) &&
                    renderEducationSection('PhD / Doctorate', 'phd', [
                      { key: 'transcript', label: 'Transcript' },
                      { key: 'certificate', label: 'Certificate' }
                    ])
                  }

                  {/* International docs only if relevant data exists */}
                  {(studentData.education?.international?.passportNumber || studentData.education?.international?.englishTestType) && 
                    renderEducationSection('International Documents', 'international', [
                      { key: 'passportPdf', label: 'Passport PDF' },
                      { key: 'testTranscript', label: 'English Test Result' },
                      { key: 'cv', label: 'Curriculum Vitae (CV)' },
                      { key: 'recommendationLetter', label: 'Recommendation Letter' }
                    ])
                  }
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showModal && selectedApp && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '700px', width: '90%', overflow: 'hidden' }}>
            <div className="modal-header">
              <h3 style={{ margin: 0 }}>🏛️ Admission Documents</h3>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <label style={{ fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Status:</label>
                <select 
                  value={selectedApp.status} 
                  onChange={(e) => handleStatusChange(selectedApp._id, e.target.value)}
                  style={{ 
                    padding: '6px 14px', 
                    borderRadius: '10px', 
                    background: selectedApp.status === 'Selected' ? '#dcfce7' : 
                               selectedApp.status === 'Rejected' ? '#fee2e2' : '#f1f5f9',
                    color: selectedApp.status === 'Selected' ? '#166534' : 
                           selectedApp.status === 'Rejected' ? '#991b1b' : '#1e293b',
                    fontSize: '12px',
                    fontWeight: 800,
                    border: 'none',
                    cursor: 'pointer'
                  }}
                >
                  {ALL_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <button className="btn-close" onClick={() => setShowModal(false)}>✕</button>
              </div>
            </div>
            <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
              {type === 'scholarship' && (
                <div className="uni-manage-list" style={{ marginBottom: 20 }}>
                  <h4 style={{ marginBottom: 15 }}>🏛️ University Admissions</h4>
                  {linkedUnivs.map(uni => {
                    const uniId = uni._id || uni;
                    const offeredData = selectedApp.offeredUniversities?.find(u => (u.university._id || u.university) === uniId);
                    const isOffered = !!offeredData;

                    return (
                      <div key={uniId} className={`uni-manage-item ${isOffered ? 'active' : ''}`} style={{
                        padding: '12px', border: '1px solid var(--border)', borderRadius: '10px', marginBottom: '8px',
                        background: isOffered ? 'rgba(108, 99, 255, 0.05)' : 'transparent'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <input type="checkbox" checked={isOffered} onChange={() => toggleUniInApp(selectedApp._id, uniId)} />
                            <span style={{ fontWeight: 'bold', fontSize: 13 }}>{uni.name}</span>
                          </div>
                          {isOffered && (
                             <select className="status-select-mini" value={offeredData.status} onChange={(e) => handleUniStatusChange(selectedApp._id, uniId, e.target.value)}>
                                {ALL_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                             </select>
                          )}
                        </div>
                        {isOffered && (
                          <div style={{ marginTop: 10, display: 'flex', gap: 10, paddingLeft: 22 }}>
                             <div className="offered-uni-actions" style={{ flex: 1, display: 'flex', gap: 5 }}>
                               <button className={`btn-publish small ${offeredData.admitCard ? 'success' : ''}`} onClick={() => handleFileUpload(selectedApp._id, 'admitCard', uniId)}>
                                 {offeredData.admitCard ? '🔄 Admit' : '+ Admit'}
                               </button>
                               {offeredData.admitCard && (
                                 <a href={getFileUrl(offeredData.admitCard)} target="_blank" rel="noreferrer" style={{ padding: '6px 10px', background: 'white', border: '1px solid #cbd5e1', borderRadius: 8 }}>👁️ View</a>
                               )}
                             </div>
                             
                             <div className="offered-uni-actions" style={{ flex: 1, display: 'flex', gap: 5 }}>
                               <button className={`btn-publish small ${offeredData.offerLetter ? 'success' : ''}`} onClick={() => handleFileUpload(selectedApp._id, 'offerLetter', uniId)}>
                                 {offeredData.offerLetter ? '🔄 Offer' : '+ Offer'}
                               </button>
                               {offeredData.offerLetter && (
                                 <a href={getFileUrl(offeredData.offerLetter)} target="_blank" rel="noreferrer" style={{ padding: '6px 10px', background: 'white', border: '1px solid #cbd5e1', borderRadius: 8 }}>👁️ View</a>
                               )}
                             </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              
              <div className="direct-docs" style={{ borderTop: '1px solid var(--border)', paddingTop: 15, padding: 20 }}>
                <h4 style={{ marginBottom: 15 }}>📤 Admission Documents (General)</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 15, marginBottom: 20 }}>
                  <div className="doc-tile-admin" style={{ padding: 15, borderRadius: 16 }}>
                    <label style={{ fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: 10, display: 'block' }}>Admit Card PDF</label>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button 
                        className={`btn-publish ${selectedApp.admitCard ? 'success' : ''}`} 
                        onClick={() => handleFileUpload(selectedApp._id, 'admitCard')}
                        style={{ flex: 1, padding: '10px', fontSize: 13, borderRadius: 10 }}
                      >
                        {selectedApp.admitCard ? '🔄 Replace PDF' : '+ Upload PDF'}
                      </button>
                      {selectedApp.admitCard && (
                        <>
                          <a href={getFileUrl(selectedApp.admitCard)} target="_blank" rel="noreferrer" style={{ padding: '10px 14px', background: 'white', border: '1px solid #cbd5e1', borderRadius: 10, textDecoration: 'none' }}>👁️ View</a>
                          <button onClick={() => handleDeleteAppDoc(selectedApp._id, 'admitCard')} style={{ padding: '10px 14px', background: '#fff1f2', border: '1px solid #fecaca', borderRadius: 10, cursor: 'pointer' }}>🗑️</button>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="doc-tile-admin" style={{ padding: 15, borderRadius: 16 }}>
                    <label style={{ fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: 10, display: 'block' }}>Offer Letter PDF</label>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button 
                        className={`btn-publish ${selectedApp.offerLetter ? 'success' : ''}`} 
                        onClick={() => handleFileUpload(selectedApp._id, 'offerLetter')}
                        style={{ flex: 1, padding: '10px', fontSize: 13, borderRadius: 10 }}
                      >
                        {selectedApp.offerLetter ? '🔄 Replace PDF' : '+ Upload PDF'}
                      </button>
                      {selectedApp.offerLetter && (
                        <>
                          <a href={getFileUrl(selectedApp.offerLetter)} target="_blank" rel="noreferrer" style={{ padding: '10px 14px', background: 'white', border: '1px solid #cbd5e1', borderRadius: 10, textDecoration: 'none' }}>👁️ View</a>
                          <button onClick={() => handleDeleteAppDoc(selectedApp._id, 'offerLetter')} style={{ padding: '10px 14px', background: '#fff1f2', border: '1px solid #fecaca', borderRadius: 10, cursor: 'pointer' }}>🗑️</button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                
                <h4 style={{ marginBottom: 12 }}>📅 Important Dates</h4>
                <div style={{ display: 'flex', gap: 15, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: 1 }}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Test Date</label>
                    <input 
                      type="date" 
                      value={selectedApp.testDate ? selectedApp.testDate.split('T')[0] : ''} 
                      onChange={(e) => handleDateUpdate(selectedApp._id, 'testDate', e.target.value)}
                      style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-card)' }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: 1 }}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Interview Date</label>
                    <input 
                      type="date" 
                      value={selectedApp.interviewDate ? selectedApp.interviewDate.split('T')[0] : ''} 
                      onChange={(e) => handleDateUpdate(selectedApp._id, 'interviewDate', e.target.value)}
                      style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-card)' }}
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-footer" style={{ padding: 20, borderTop: '1px solid var(--border)', textAlign: 'right' }}>
              <button className="btn-publish" onClick={() => setShowModal(false)} style={{ width: '100%' }}>Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
