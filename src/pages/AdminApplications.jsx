import { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
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

export default function AdminApplications() {
  const navigate = useNavigate();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [filterState, setFilterState] = useState('');
  const [filterCity, setFilterCity] = useState('');
  const [levelFilter, setLevelFilter] = useState('');
  const [selectedIds, setSelectedIds] = useState([]); // For bulk actions
  const [currentPage, setCurrentPage] = useState(1);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const itemsPerPage = 10;

  // Modal State
  const [showModal, setShowModal] = useState(false); // For Manage Universities (Scholarships)
  const [selectedApp, setSelectedApp] = useState(null);
  const [linkedUnivs, setLinkedUnivs] = useState([]);
  const [modalLoading, setModalLoading] = useState(false);

  // New Student Details Modal State
  const [showStudentModal, setShowStudentModal] = useState(false);
  const [studentData, setStudentData] = useState(null);
  const [activeTab, setActiveTab] = useState('account');
  const [currentAppForModal, setCurrentAppForModal] = useState(null);
  const [studentLoading, setStudentLoading] = useState(false);

  const fetchApplicants = useCallback(async () => {
    setLoading(true);
    try {
      const res = await API.get('/applications/admin/list');
      setData(res.data.data || []);
    } catch (err) {
      console.error(err);
      setData([]);
    } finally {
      setLoading(false);
    }
  }, []);

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

  const downloadEducationDoc = async (section, field, preferredName) => {
    try {
      const response = await API.get(
        `/users/${studentData._id}/education/${section}/${field}/download`,
        {
          params: { downloadName: preferredName },
          responseType: 'blob',
        }
      );

      const blobUrl = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = preferredName || `${section}-${field}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error('Education download failed:', err);
      alert('Failed to download document');
    }
  };

  const openManageModal = async (app) => {
    setSelectedApp(app);
    setShowModal(true);
    setModalLoading(true);
    try {
      if (!app?.scholarship?._id) {
        setLinkedUnivs([]);
        return;
      }
      const res = await API.get(`/scholarships/${app.scholarship._id}`);
      setLinkedUnivs(res.data.data?.linkedUniversities || []);
    } catch (err) {
      console.error(err);
      setLinkedUnivs([]);
    } finally {
      setModalLoading(false);
    }
  };

  const openStudentModal = async (app) => {
    setShowStudentModal(true);
    setActiveTab('account');
    setCurrentAppForModal(app);
    setStudentData({ ...(app.user || {}), country: ADMIN_COUNTRY });
    setStudentLoading(true);

    try {
      const userId = app?.user?._id;
      if (!userId) return;
      const res = await API.get(`/users/${userId}`);
      setStudentData({ ...(res.data?.data || {}), country: ADMIN_COUNTRY });
    } catch (err) {
      console.error('Student profile fetch failed:', err);
    } finally {
      setStudentLoading(false);
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
      const query = searchTerm.toLowerCase();
      const matchesSearch = !query || (
        app.user?.name?.toLowerCase().includes(query) ||
        app.user?.email?.toLowerCase().includes(query) ||
        app.university?.name?.toLowerCase().includes(query) ||
        app.scholarship?.title?.toLowerCase().includes(query)
      );
      const matchesStatus = !statusFilter || app.status === statusFilter;
      const applicantCountry = app.user?.country || ADMIN_COUNTRY;
      const matchesCountry = applicantCountry === ADMIN_COUNTRY;
      const matchesState = !filterState || app.user?.state === filterState;
      const matchesCity = !filterCity || app.user?.city === filterCity;
      const matchesLevel =
        !levelFilter ||
        app.selectedPrograms?.some((p) =>
          p.programName?.toLowerCase().includes(levelFilter.toLowerCase())
        );
      
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
      
      return matchesSearch && matchesStatus && matchesCountry && matchesState && matchesCity && matchesLevel;
    }).sort((a, b) => new Date(b.appliedAt) - new Date(a.appliedAt));
  }, [data, searchTerm, statusFilter, filterState, filterCity, levelFilter, startDate, endDate]);

  const levelCounts = useMemo(() => {
    return data.reduce((acc, app) => {
      app.selectedPrograms?.forEach((p) => {
        const name = (p.programName || '').toLowerCase();
        if (name.includes('bachelor')) acc.bachelor += 1;
        else if (name.includes('master')) acc.master += 1;
        else if (name.includes('phd') || name.includes('doctor')) acc.phd += 1;
      });
      return acc;
    }, { bachelor: 0, master: 0, phd: 0 });
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

  const tableStyle = {
    width: '100%',
    borderCollapse: 'separate',
    borderSpacing: 0,
    tableLayout: 'fixed',
    fontSize: 12
  };

  const tableHeaderCell = {
    padding: '12px 10px',
    whiteSpace: 'normal',
    wordBreak: 'break-word',
    overflowWrap: 'anywhere',
    verticalAlign: 'top'
  };

  const tableBodyCell = {
    padding: '12px 10px',
    whiteSpace: 'normal',
    wordBreak: 'break-word',
    overflowWrap: 'anywhere',
    verticalAlign: 'top'
  };

  const compactActionButtonStyle = {
    minWidth: 28,
    width: 28,
    height: 28,
    borderRadius: 8,
    padding: 0
  };

  const getPersonalInfo = (student) => student?.education?.personalInfo || {};

  const renderIdentityBlock = () => {
    if (!studentData) return null;
    const personalInfo = getPersonalInfo(studentData);

    return (
      <div
        className="identity-summary"
        style={{
          marginBottom: 25,
          padding: '18px',
          background: '#F8FAFC',
          borderRadius: 16,
          border: '1px solid var(--border)',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 12,
        }}
      >
        <div className="info-field">
          <label style={{ fontSize: 10, fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>Full Name</label>
          <div style={{ fontWeight: 800, fontSize: 15, color: '#0F172A', marginTop: 4 }}>{studentData.name || 'Not provided'}</div>
        </div>
        <div className="info-field">
          <label style={{ fontSize: 10, fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>Father Name</label>
          <div style={{ fontWeight: 700, color: '#0F172A', marginTop: 4 }}>{personalInfo.fatherName || studentData.fatherName || 'Not provided'}</div>
        </div>
        <div className="info-field">
          <label style={{ fontSize: 10, fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>Date Of Birth</label>
          <div style={{ fontWeight: 700, color: '#0F172A', marginTop: 4 }}>
            {(personalInfo.dateOfBirth || studentData.dateOfBirth)
              ? new Date(personalInfo.dateOfBirth || studentData.dateOfBirth).toLocaleDateString()
              : 'N/A'}
          </div>
        </div>
        <div className="info-field">
          <label style={{ fontSize: 10, fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>Contact</label>
          <div style={{ fontWeight: 700, color: '#0F172A', marginTop: 4 }}>{personalInfo.contactNumber || studentData.phone || 'N/A'}</div>
        </div>
        <div className="info-field">
          <label style={{ fontSize: 10, fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>Email</label>
          <div style={{ fontWeight: 700, fontSize: 12, color: '#0F172A', marginTop: 4 }}>{studentData.email || 'N/A'}</div>
        </div>
        <div className="info-field">
          <label style={{ fontSize: 10, fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>Country</label>
          <div style={{ fontWeight: 700, color: '#0F172A', marginTop: 4 }}>{studentData.country || ADMIN_COUNTRY}</div>
        </div>
      </div>
    );
  };

  const renderEducationSection = (title, section, fields) => {
    const eduData = studentData?.education?.[section] || {};
    const personalInfo = getPersonalInfo(studentData);
    return (
      <div key={section} className="edu-mgmt-section" style={{ 
        marginBottom: 25, 
        padding: 24, 
        background: '#ffffff', 
        borderRadius: 16,
        border: '1px solid var(--border)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, borderBottom: '1px solid #f1f5f9', paddingBottom: 15 }}>
          <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 10, color: 'var(--primary)' }}>
            {section === 'nationalId' ? '👤' : '📁'} {section === 'nationalId' ? 'Personal Profile / Identity' : title}
          </h4>
          {eduData.enabled && <span className="badge badge-active" style={{ fontSize: 10 }}>Active Section</span>}
        </div>

        {/* Text Details first */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 15, marginBottom: 20 }}>
          {section === 'nationalId' && (
            <>
              <div className="info-field">
                <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>NIC / ID Number</label>
                <div style={{ fontWeight: 600 }}>{personalInfo.cnicNumber || eduData.idNumber || 'Not provided'}</div>
              </div>
              <div className="info-field">
                <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Home Address</label>
                <div style={{ fontWeight: 600 }}>{studentData.address || 'Not provided'}</div>
              </div>
              <div className="info-field">
                <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Location</label>
                <div style={{ fontWeight: 600 }}>{studentData.city ? `${studentData.city}, ${studentData.state}, ${studentData.country || ADMIN_COUNTRY}` : 'Not provided'}</div>
              </div>
              <div className="info-field">
                <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Father Name</label>
                <div style={{ fontWeight: 600 }}>{personalInfo.fatherName || studentData.fatherName || 'Not provided'}</div>
              </div>
              <div className="info-field">
                <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Contact Number</label>
                <div style={{ fontWeight: 600 }}>{personalInfo.contactNumber || studentData.phone || 'Not provided'}</div>
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
                  {section === 'matric' || section === 'intermediate' ? 'School/College' : 'Previous Institute / University'}
                </label>
                <div style={{ fontWeight: 600 }}>{eduData.schoolName || eduData.collegeName || 'N/A'}</div>
              </div>
              {(section === 'bachelor' || section === 'masters' || section === 'phd') && (
                <div className="info-field">
                  <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                    Degree Name
                  </label>
                  <div style={{ fontWeight: 600 }}>{eduData.degreeName || 'N/A'}</div>
                </div>
              )}
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

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 15 }}>
          {fields.map(f => {
            const fileName = eduData[f.key];
            const displayLabel = `${studentData?.name}_${title}_${f.label}`.replace(/\s+/g, '_');
            return (
              <div key={f.key} className="doc-tile" style={{ background: 'var(--bg-card)', padding: 15, borderRadius: 12, border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{f.label}</span>
                  <span className={`badge ${fileName ? 'badge-active' : ''}`} style={{ fontSize: 10 }}>
                    {fileName ? 'Uploaded' : 'Pending'}
                  </span>
                </div>
                {fileName && (
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 12, wordBreak: 'break-all', opacity: 1, fontWeight: 500 }}>
                    Name: {displayLabel}.pdf
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {fileName ? (
                    <>
                      <a
                        href={getFileUrl(fileName)}
                        target="_blank"
                        rel="noreferrer"
                        className="btn-icon small"
                        title="View PDF"
                        style={{ background: '#10B981', color: 'white' }}
                      >
                        V
                      </a>
                      <button
                        className="btn-icon small"
                        onClick={() =>
                          downloadEducationDoc(
                            section,
                            f.key,
                            `${displayLabel}.pdf`
                          )
                        }
                        title="Download PDF"
                        style={{ background: '#0F766E', color: 'white' }}
                      >
                        D
                      </button>
                      <button
                        className="btn-icon small"
                        onClick={() => handleDocUpload(section, f.key)}
                        title="Change PDF"
                        style={{ background: '#6366F1', color: 'white' }}
                      >
                        C
                      </button>
                      <button
                        className="btn-icon small"
                        onClick={() => deleteDoc(section, f.key)}
                        title="Delete"
                        style={{ background: '#EF4444', color: 'white' }}
                      >
                        X
                      </button>
                    </>
                  ) : (
                    <button className="btn-publish" style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => handleDocUpload(section, f.key)}>
                      + Upload PDF
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="applicants-page" style={{ overflowX: 'hidden' }}>
      <div className="table-card">
        <div className="table-header" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 15 }}>
              
              <div>
                <h2 style={{ color: "#000000", fontWeight: 900 }}>👥 All Applications</h2>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
                  Managing all applications for your posts.
                </p>
              </div>
            </div>
            <span className="badge badge-active" style={{ fontSize: 14 }}>Total: {filteredData.length}</span>
          </div>

          <div className="filter-bar" style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', width: '100%', padding: '16px', background: '#ffffff', border: '1px solid var(--border)', borderRadius: '16px', boxShadow: '0 2px 10px rgba(0,0,0,0.02)' }}>
            <div className="search-input-group" style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
                <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }}>🔍</span>
                <input 
                    type="text" 
                    placeholder="Search name, email, or university/scholarship..." 
                    value={searchTerm}
                    onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                    style={{ width: '100%', padding: '12px 12px 12px 40px', borderRadius: '10px', border: '1px solid var(--border)', background: '#f8fafc', color: 'var(--text-primary)', fontSize: '14px', outline: 'none' }}
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

            <select value={levelFilter} onChange={(e) => { setLevelFilter(e.target.value); setCurrentPage(1); }} style={filterSelectStyle}>
                <option value="">All Levels</option>
                <option value="bachelor">Bachelor ({levelCounts.bachelor})</option>
                <option value="master">Master ({levelCounts.master})</option>
                <option value="phd">PhD ({levelCounts.phd})</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="loading"><div className="spinner"></div> Loading...</div>
        ) : filteredData.length === 0 ? (
          <div className="empty-msg">No applications found matching your criteria.</div>
        ) : (
          <>
            <div style={{ width: '100%', overflowX: 'hidden' }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={{ ...tableHeaderCell, width: '4%' }}>#</th>
                  <th style={{ ...tableHeaderCell, width: '17%' }}>Student Info</th>
                  <th style={{ ...tableHeaderCell, width: '12%' }}>Location</th>
                  <th style={{ ...tableHeaderCell, width: '21%' }}>Applied Info</th>
                  <th style={{ ...tableHeaderCell, width: '18%' }}>Programs / Level</th>
                  <th style={{ ...tableHeaderCell, width: '10%' }}>Status</th>
                  <th style={{ ...tableHeaderCell, width: '8%' }}>Date</th>
                  <th
                    style={{
                      ...tableHeaderCell,
                      textAlign: 'center',
                      width: '10%',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {currentItems.map((app, index) => {
                  const serialNumber = indexOfFirstItem + index + 1;
                  return (
                    <tr key={app._id}>
                      <td style={{ ...tableBodyCell, color: 'var(--text-secondary)', fontWeight: 'bold' }}>{serialNumber}</td>
                      <td style={tableBodyCell}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                          <div className="admin-avatar" style={{ width: 32, height: 32, fontSize: 12 }}>
                            {app.user?.name?.charAt(0) || '?'}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 'bold', overflowWrap: 'anywhere' }}>{app.user?.name || 'Unknown User'}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-secondary)', overflowWrap: 'anywhere' }}>{app.user?.email}</div>
                          </div>
                        </div>
                      </td>
                      <td style={tableBodyCell}>
                        <div style={{ fontSize: 13, fontWeight: 'bold', color: 'var(--primary)' }}>{app.user?.country || ADMIN_COUNTRY}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                          {app.user?.city ? `${app.user.city}, ${app.user.state}` : 'Location unknown'}
                        </div>
                        {app.user?.address && (
                          <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 2, overflowWrap: 'anywhere' }}>
                            {app.user.address}
                          </div>
                        )}
                      </td>
                      <td style={tableBodyCell}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                          {app.type === 'University' && app.university?.thumbnail ? (
                            <img 
                              src={`${API.defaults.baseURL.replace('/api', '')}/uploads/${app.university.thumbnail}`} 
                              alt="logo" 
                              style={{ width: 32, height: 32, borderRadius: 6, objectFit: 'cover', border: '1px solid var(--border)' }}
                            />
                          ) : (
                            <div style={{ width: 32, height: 32, borderRadius: 6, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>
                              {app.type === 'University' ? '🏛️' : '🎓'}
                            </div>
                          )}
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 13, overflowWrap: 'anywhere' }}>{app.scholarship?.title || app.university?.name}</div>
                            <div style={{ fontSize: 10, color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{app.type}</div>
                          </div>
                        </div>
                      </td>
                      <td style={tableBodyCell}>
                        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                          {app.selectedPrograms?.map((p, idx) => (
                            <span key={idx} style={{ 
                              fontSize: 10, 
                              padding: '3px 8px', 
                              border: '1px solid var(--primary-light)', 
                              borderRadius: '4px',
                              color: 'var(--primary)',
                              fontWeight: 600,
                              whiteSpace: 'normal',
                              wordBreak: 'break-word',
                              overflowWrap: 'anywhere',
                              maxWidth: '100%'
                            }}>
                              Applied for {p.programName}
                            </span>
                          ))}
                          {(!app.selectedPrograms || app.selectedPrograms.length === 0) && (
                            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>-</span>
                          )}
                        </div>
                      </td>
                      <td style={tableBodyCell}>
                        <select 
                          value={app.status} 
                          onChange={(e) => handleStatusChange(app._id, e.target.value)}
                          style={{ 
                            width: '100%',
                            padding: '6px 8px', 
                            borderRadius: 8, 
                            background: 'rgba(0,0,0,0.05)', 
                            border: '1px solid var(--border)',
                            color: 'var(--text-primary)',
                            fontSize: 12
                          }}
                        >
                          {ALL_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </td>
                      <td style={{ ...tableBodyCell, fontSize: 12, color: 'var(--text-secondary)' }}>
                        {new Date(app.appliedAt).toLocaleDateString()}
                      </td>
                      <td style={tableBodyCell}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
                          <button 
                            className="btn-icon" 
                            title="View/Edit Profile"
                            onClick={() => openStudentModal(app)}
                            style={{ ...compactActionButtonStyle, background: '#6366F1', color: 'white' }}
                          >
                            👁️
                          </button>
                          {app.scholarship && (
                            <button 
                              className="btn-icon" 
                              title="Manage Universities"
                              onClick={() => openManageModal(app)}
                              style={{ ...compactActionButtonStyle, background: 'var(--primary-light)', color: 'white' }}
                            >
                              🏛️
                            </button>
                          )}
                          <button 
                            className={`btn-icon ${app.admitCard ? 'success' : ''}`} 
                            title="Admit Card"
                            onClick={() => handleFileUpload(app._id, 'admitCard')}
                            style={{ ...compactActionButtonStyle, background: app.admitCard ? 'var(--success)' : '' }}
                          >
                            🪪
                          </button>
                          <button 
                            className={`btn-icon ${app.offerLetter ? 'success' : ''}`} 
                            title="Offer Letter"
                            onClick={() => handleFileUpload(app._id, 'offerLetter')}
                            style={{ ...compactActionButtonStyle, background: app.offerLetter ? 'var(--success)' : '' }}
                          >
                            ✉️
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
            <div className="modal-header" style={{ flexWrap: 'wrap', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 15 }}>
                <div className="admin-avatar" style={{ width: 45, height: 45 }}>{studentData.name?.charAt(0)}</div>
                <div>
                  <h3 style={{ margin: 0 }}>Student Profile</h3>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>{studentData.email}</span>
                </div>
              </div>
              <button className="btn-close" onClick={() => setShowStudentModal(false)}>✕</button>
            </div>
            
            <div className="modal-tabs" style={{ display: 'flex', borderBottom: '1px solid var(--border)', padding: '0 20px', gap: 30 }}>
              {[{ id: 'account', label: 'Personal Profile' }, { id: 'education', label: 'Education Docs' }].map(tab => {
                return (
                  <button 
                    key={tab.id} 
                    onClick={() => setActiveTab(tab.id)}
                    style={{
                      padding: '15px 0',
                      background: 'none',
                      border: 'none',
                      borderBottom: activeTab === tab.id ? '3px solid var(--primary)' : '3px solid transparent',
                      color: activeTab === tab.id ? 'var(--primary)' : 'var(--text-secondary)',
                      fontWeight: activeTab === tab.id ? 800 : 500,
                      cursor: 'pointer'
                    }}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            <div className="modal-body" style={{ maxHeight: 'calc(90vh - 150px)', overflowY: 'auto' }}>
              {studentLoading ? (
                <div className="loading"><div className="spinner"></div> Loading student profile...</div>
              ) : (
              activeTab === 'account' ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 20 }}>
                  <div className="form-group">
                    <label>Full Name</label>
                    <input type="text" value={studentData.name || ''} onChange={e => setStudentData({...studentData, name: e.target.value})} />
                  </div>
                  <div className="form-group">
                    <label>Email Address</label>
                    <input type="email" value={studentData.email || ''} onChange={e => setStudentData({...studentData, email: e.target.value})} />
                  </div>
                  <div className="form-group">
                    <label>Phone Number</label>
                    <input type="text" value={studentData.phone || ''} onChange={e => setStudentData({...studentData, phone: e.target.value})} />
                  </div>
                  
                  {/* Geographic Details & Address */}
                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label>Home Address</label>
                    <input 
                      type="text" 
                      placeholder="Street address, house number, etc."
                      value={studentData.address || ''} 
                      onChange={e => setStudentData({...studentData, address: e.target.value})} 
                    />
                  </div>

                  <div className="form-group">
                    <label>Country</label>
                    <input className="form-control" value={ADMIN_COUNTRY} readOnly />
                  </div>

                  <div className="form-group">
                    <label>Province / State</label>
                    <select 
                      className="form-control"
                      value={studentData.state || ''} 
                      onChange={e => setStudentData({...studentData, country: ADMIN_COUNTRY, state: e.target.value, city: ''})}
                    >
                      <option value="">Select State</option>
                      {getStates(ADMIN_COUNTRY).map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>

                  <div className="form-group">
                    <label>City</label>
                    <select 
                      className="form-control"
                      value={studentData.city || ''} 
                      onChange={e => setStudentData({...studentData, city: e.target.value})}
                      disabled={!studentData.state}
                    >
                      <option value="">Select City</option>
                      {studentData.state && getCities(ADMIN_COUNTRY, studentData.state).map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div style={{ gridColumn: '1 / -1', marginTop: 10 }}>
                    <button className="btn-publish" onClick={handleStudentUpdate}>Save Account Changes</button>
                  </div>
                </div>
              ) : (
                <div className="education-mgmt">
                                   {/* Application Target Info */}
                  <div style={{ marginBottom: 25, padding: 20, background: '#f8fafc', borderRadius: 16, border: '1px solid var(--border)' }}>
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
                          boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <span style={{
                              width: 28, height: 28,
                              background: 'var(--primary)',
                              color: 'white',
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

                  {renderIdentityBlock()}

                  {renderEducationSection('National ID', 'nationalId', [
                    { key: 'file', label: 'ID Card PDF' }
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
              )
              )}
            </div>
          </div>
        </div>
      )}

      {showModal && selectedApp && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '700px', width: '90%', overflow: 'hidden' }}>
            <div className="modal-header">
              <h3>📄 Admission Docs</h3>
              <button className="btn-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
                Select universities from the scholarship pool and manage their individual admission progress.
              </p>
              
              {modalLoading ? (
                <div className="loading"><div className="spinner"></div> Loading pool...</div>
              ) : (
                <div className="uni-manage-list">
                  {linkedUnivs.length === 0 ? (
                    <p>No universities linked to this scholarship.</p>
                  ) : (
                    linkedUnivs.map(uni => {
                      const uniId = uni._id || uni;
                      const offeredData = selectedApp.offeredUniversities?.find(u => (u.university._id || u.university) === uniId);
                      const isOffered = !!offeredData;

                      return (
                        <div key={uniId} className={`uni-manage-item ${isOffered ? 'active' : ''}`} style={{
                          padding: '15px', 
                          border: '1px solid var(--border)', 
                          borderRadius: '12px', 
                          marginBottom: '10px',
                          background: isOffered ? 'rgba(108, 99, 255, 0.05)' : 'transparent'
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                              <input 
                                type="checkbox" 
                                checked={isOffered} 
                                onChange={() => toggleUniInApp(selectedApp._id, uniId)}
                                style={{ width: 18, height: 18, cursor: 'pointer' }}
                              />
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                {uni.thumbnail && <img src={uni.thumbnail} alt="" style={{ width: 30, height: 30, borderRadius: '50%' }} />}
                                <span style={{ fontWeight: 'bold' }}>{uni.name}</span>
                              </div>
                            </div>
                            {isOffered && <span className="badge badge-active">Offered</span>}
                          </div>

                          {isOffered && (
                            <div style={{ marginTop: 15, paddingLeft: 30, borderLeft: '2px solid var(--primary)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '15px' }}>
                              <div className="form-group">
                                <label style={{ fontSize: 11, marginBottom: 5 }}>Status</label>
                                <select 
                                  value={offeredData.status} 
                                  onChange={(e) => handleUniStatusChange(selectedApp._id, uniId, e.target.value)}
                                  style={{ width: '100%', padding: '6px', fontSize: 12, borderRadius: 6 }}
                                >
                                  {ALL_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                              </div>
                              <div className="form-group">
                                <label style={{ fontSize: 11, marginBottom: 5 }}>Docs</label>
                                <div style={{ display: 'flex', gap: 10 }}>
                                  <button 
                                    className={`btn-icon small ${offeredData.admitCard ? 'success' : ''}`} 
                                    onClick={() => handleFileUpload(selectedApp._id, 'admitCard', uniId)}
                                    title="Upload Admit Card"
                                  >
                                    🪪 {offeredData.admitCard ? '✓' : ''}
                                  </button>
                                  <button 
                                    className={`btn-icon small ${offeredData.offerLetter ? 'success' : ''}`} 
                                    onClick={() => handleFileUpload(selectedApp._id, 'offerLetter', uniId)}
                                    title="Upload Offer Letter"
                                  >
                                    ✉️ {offeredData.offerLetter ? '✓' : ''}
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn-publish" onClick={() => setShowModal(false)} style={{ width: '100%' }}>Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
