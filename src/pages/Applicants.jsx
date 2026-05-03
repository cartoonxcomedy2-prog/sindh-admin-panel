import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import API from '../api';
import imageCompression from 'browser-image-compression';
import { getStates, getCities } from '../data/locations';

const ALL_STATUSES = ['Applied', 'Admit Card', 'Test', 'Interview', 'Selected', 'Rejected'];
const ADMIN_COUNTRY = 'Pakistan';

const unwrapFileValue = (value) => {
  if (!value) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'object') {
    const urlLike =
      value.secure_url ||
      value.url ||
      value.path ||
      value.file ||
      value.fileUrl ||
      value.downloadUrl;
    if (typeof urlLike === 'string' && urlLike.trim()) return urlLike.trim();
    const named =
      value.originalName ||
      value.originalname ||
      value.fileName ||
      value.filename ||
      value.name;
    if (typeof named === 'string' && named.trim()) return named.trim();
  }
  return String(value).trim();
};

const extractEmbeddedUrl = (value) => {
  const raw = unwrapFileValue(value);
  if (!raw) return '';
  const matched = raw.match(/https?:\/\/[^\s"<>]+/i);
  if (!matched?.[0]) return '';
  return matched[0].replace(/[\],);.]+$/g, '');
};

const getFileUrl = (fileName) => {
  if (!fileName) return '';
  const raw = unwrapFileValue(fileName);
  const embedded = extractEmbeddedUrl(raw);
  let cleanPath = raw;
  if (cleanPath.includes('uploads/')) {
    cleanPath = cleanPath.split('uploads/').pop();
  }
  if (cleanPath.startsWith('/')) cleanPath = cleanPath.slice(1);
  const sourceUrl = embedded || `${API.defaults.baseURL.replace('/api', '')}/uploads/${cleanPath}`;

  try {
    const parsed = new URL(sourceUrl);
    const isCloudinary = /cloudinary\.com$/i.test(parsed.hostname);
    const pathAndSearch = `${parsed.pathname || ''}${parsed.search || ''}`.toLowerCase();
    const isDocument = /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|txt|csv)$/i.test(pathAndSearch)
      || pathAndSearch.includes('format=pdf')
      || pathAndSearch.includes('fl_attachment');
    if (
      isCloudinary &&
      isDocument &&
      (parsed.pathname || '').includes('/image/upload/')
    ) {
      return sourceUrl.replace('/image/upload/', '/raw/upload/');
    }
  } catch {
    // ignore URL parse errors and return source URL
  }

  return sourceUrl;
};

const sanitizeFileNamePart = (value, fallback = 'document') => {
  const cleaned = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return cleaned || fallback;
};

const triggerBlobDownload = (blobData, downloadName) => {
  if (!blobData) return;
  try {
    const url = window.URL.createObjectURL(new Blob([blobData]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', downloadName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  } catch (err) {
    console.error('Blob download trigger failed:', err);
  }
};

const normalizeId = (value) => {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    if (value._id) return String(value._id);
    if (value.id) return String(value.id);
  }
  return String(value);
};

const getStoredFileName = (value, fallback = 'document.pdf') => {
  const objectName =
    value && typeof value === 'object'
      ? value.originalName || value.originalname || value.fileName || value.filename
      : '';
  if (typeof objectName === 'string' && objectName.trim()) {
    return objectName.trim();
  }
  const raw = unwrapFileValue(value);
  if (!raw) return fallback;
  const embedded = extractEmbeddedUrl(raw);
  const source = embedded || raw;
  let pathLike = source;
  try {
    pathLike = new URL(source).pathname || source;
  } catch {
    pathLike = source;
  }
  const normalized = String(pathLike || '').split('?')[0];
  const base = normalized.split('/').filter(Boolean).pop() || fallback;
  try {
    return decodeURIComponent(base);
  } catch {
    return base;
  }
};

const parseApiErrorMessage = (err, fallback = 'Request failed') => {
  const message = err?.response?.data?.message || err?.message;
  if (typeof message === 'string' && message.trim()) {
    return message.trim();
  }
  return fallback;
};

const oneLineEllipsisStyle = {
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

const tableHeaderCell = {
  padding: '14px 16px',
  textAlign: 'left',
  fontSize: '11px',
  fontWeight: 800,
  textTransform: 'uppercase',
  color: '#64748b',
  letterSpacing: '0.05em',
  background: '#f8fafc',
  borderBottom: '2px solid #e2e8f0'
};

const tableBodyCell = {
  padding: '12px 16px',
  fontSize: '13px',
  color: '#1e293b',
  borderBottom: '1px solid #f1f5f9'
};

const compactActionButtonStyle = {
  padding: '6px 12px',
  borderRadius: '8px',
  fontSize: '10px',
  fontWeight: 800,
  cursor: 'pointer',
  border: 'none',
  transition: 'all 0.2s ease',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '4px',
  height: '30px',
  minWidth: '65px'
};

export default function Applicants() {
  const { type, id } = useParams();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [targetName, setTargetName] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [filterCity, setFilterCity] = useState('');
  const [programFilter, setProgramFilter] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [serverPagination, setServerPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
  });

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [selectedApp, setSelectedApp] = useState(null);
  const [linkedUnivs, setLinkedUnivs] = useState([]);

  // Student Details Modal State
  const [showStudentModal, setShowStudentModal] = useState(false);
  const [studentData, setStudentData] = useState({});
  const [activeTab, setActiveTab] = useState('account');
  const [currentAppForModal, setCurrentAppForModal] = useState(null);
  const [studentLoading, setStudentLoading] = useState(false);
  const [isSavingStudent, setIsSavingStudent] = useState(false);
  const [expandedUserIds, setExpandedUserIds] = useState(new Set());
  const [studentHistory, setStudentHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const getStatusColor = (status) => {
    switch (status) {
      case 'Selected': return '#10B981';
      case 'Rejected': return '#EF4444';
      case 'Interview': return '#6366F1';
      case 'Test': return '#F59E0B';
      case 'Admit Card': return '#8B5CF6';
      case 'Applied': return '#64748B';
      default: return '#1e293b';
    }
  };

  const handleEduChange = (section, field, value) => {
    setStudentData(prev => ({
      ...prev,
      education: {
        ...prev.education,
        [section]: {
          ...(prev.education?.[section] || {}),
          [field]: value
        }
      }
    }));
  };

  const saveStudentProfile = async () => {
    if (!studentData?._id) return;
    setIsSavingStudent(true);
    try {
      await API.put(`/users/${studentData?._id}/profile`, studentData);
      alert('Student profile updated successfully!');
      const studentWithoutPassword = { ...studentData };
      delete studentWithoutPassword.password;
      setStudentData(studentWithoutPassword);
      setData(prev => prev.map(app => 
        app.user?._id === studentData?._id ? { ...app, user: studentWithoutPassword } : app
      ));
    } catch (err) {
      console.error('Failed to update profile:', err);
      alert('Update failed: ' + (err.response?.data?.message || err.message));
    } finally {
      setIsSavingStudent(false);
    }
  };

  const allCities = useMemo(() => {
    const stateList = getStates(ADMIN_COUNTRY);
    const citySet = new Set();
    stateList.forEach((stateName) => {
      getCities(ADMIN_COUNTRY, stateName).forEach((cityName) => citySet.add(cityName));
    });
    return Array.from(citySet).sort((a, b) => a.localeCompare(b));
  }, []);

  const fetchApplicants = useCallback(async () => {
    setLoading(true);
    try {
      const res = await API.get(`/applications/${type}/${id}`, {
        params: {
          page: currentPage,
          limit: serverPagination.limit,
          search: searchTerm || undefined,
          status: statusFilter || undefined,
          city: filterCity || undefined,
          program: programFilter || undefined,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
        },
      });
      setData(res.data.data || []);
      const pagination = res.data?.pagination || {};
      setServerPagination((prev) => ({
        ...prev,
        page: pagination.page ?? currentPage,
        limit: pagination.limit ?? prev.limit,
        total: pagination.total ?? (res.data.data || []).length,
        totalPages: pagination.totalPages ?? 1,
      }));
    } catch (err) {
      console.error(err);
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [type, id, currentPage, serverPagination.limit, searchTerm, statusFilter, filterCity, programFilter, startDate, endDate]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchApplicants();
    }, 200);
    return () => clearTimeout(timer);
  }, [fetchApplicants]);

  useEffect(() => {
    const fetchTarget = async () => {
      try {
        const targetRes = await API.get(`/${type === 'university' ? 'universities' : 'scholarships'}/${id}`);
        const targetData = targetRes.data.data;
        setTargetName(targetData.name || targetData.title || 'Record');
        if (type === 'scholarship') {
          setLinkedUnivs(targetData.linkedUniversities || []);
        } else {
          setLinkedUnivs([]);
        }
      } catch (err) {
        console.error(err);
        setTargetName('Record');
      }
    };
    fetchTarget();
  }, [type, id]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, filterCity, programFilter, startDate, endDate]);

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
      if (file.type.startsWith('image/')) {
        const options = { maxSizeMB: 1, maxWidthOrHeight: 1280, useWebWorker: true };
        try { uploadFile = await imageCompression(file, options); } catch {}
      }
      const formData = new FormData();
      formData.append(field, uploadFile);
      if (universityId) formData.append('universityId', universityId);
      try {
        const url = universityId ? `/applications/${appId}/university-status` : `/applications/${appId}`;
        const res = await API.put(url, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
        setSelectedApp(res.data.data);
        setData(prev => prev.map(a => (a._id === appId || a._id === res.data.data?._id) ? res.data.data : a));
        alert('File uploaded!');
      } catch (err) {
        alert(`Upload failed: ${parseApiErrorMessage(err)}`);
      }
    };
    input.click();
  };

  const handleDownloadAppDoc = (appId, field, fileName, uniId = null) => {
    const displayLabel = field === 'admitCard' ? 'Admit_Card' : 'Offer_Letter';
    const fallbackName = `${displayLabel}_${Date.now()}.pdf`;
    API.get(`/applications/${appId}/download-doc/${field}`, {
      params: { downloadName: fallbackName, universityId: uniId || undefined },
      responseType: 'blob',
    }).then(res => {
      triggerBlobDownload(res.data, fallbackName);
    }).catch(err => {
      console.error('Download failed:', err);
      const url = getFileUrl(fileName);
      if (url) window.open(url, '_blank');
      else alert('Download failed');
    });
  };

  const handleDownloadEduDoc = (userId, section, field, fileName) => {
    const fallbackName = `${section}_${field}_${Date.now()}.pdf`;
    API.get(`/users/${userId}/education/${section}/${field}/download`, {
      params: { downloadName: fallbackName },
      responseType: 'blob'
    }).then(res => {
      triggerBlobDownload(res.data, fallbackName);
    }).catch(err => {
      console.error('Download failed:', err);
      const url = getFileUrl(fileName);
      if (url) window.open(url, '_blank');
      else alert('Download failed');
    });
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
      await API.put(`/users/${studentData?._id}/profile`, { ...studentData, country: ADMIN_COUNTRY });
      alert('Profile updated');
      fetchApplicants();
    } catch {
      alert('Update failed');
    }
  };

  const handleDateUpdate = async (appId, field, value) => {
    try {
      const payload = { [field]: value || null };
      const res = await API.put(`/applications/${appId}`, payload);
      setSelectedApp(res.data.data);
      setData(prev => prev.map(a => a._id === appId ? res.data.data : a));
    } catch (err) {
      alert('Failed to update date');
    }
  };

  const handleDeleteAppDoc = async (appId, field) => {
    if (!window.confirm(`Delete document?`)) return;
    try {
      const payload = { [field]: null };
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
      if (file.type.startsWith('image/')) {
        const options = { maxSizeMB: 1, maxWidthOrHeight: 1280, useWebWorker: true };
        try { uploadFile = await imageCompression(file, options); } catch {}
      }
      const formData = new FormData();
      formData.append(field, uploadFile);
      formData.append('section', section);
      formData.append('field', field);
      try {
        const res = await API.put(`/users/${studentData?._id}/education`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        setStudentData({ ...(res.data.data || {}), country: ADMIN_COUNTRY });
        alert('Document uploaded');
        fetchApplicants();
      } catch (err) {
        alert('Upload failed');
      }
    };
    input.click();
  };

  const deleteDoc = async (section, field) => {
    if (!window.confirm(`Delete ${field} for ${section}?`)) return;
    try {
      await API.delete(`/users/${studentData?._id}/education/${section}/${field}`);
      const userRes = await API.get(`/users/${studentData?._id}`);
      setStudentData({ ...(userRes.data.data || {}), country: ADMIN_COUNTRY });
      alert('Document deleted');
      fetchApplicants();
    } catch (err) {
      alert('Delete failed');
    }
  };

  const handleDeleteUniDoc = async (appId, uniId, field) => {
    if (!window.confirm(`Delete document for this university?`)) return;
    try {
      const payload = { universityId: uniId, [field]: null };
      const res = await API.put(`/applications/${appId}/university-status`, payload);
      setSelectedApp(res.data.data);
      setData(prev => prev.map(a => a._id === appId ? res.data.data : a));
    } catch {
      alert('Failed to delete document');
    }
  };

  const handleDownloadFullBundle = async (app) => {
    const targetApp = app || currentAppForModal;
    if (!targetApp?._id) return;
    try {
      const preferredName = `${sanitizeFileNamePart(targetApp.user?.name || 'applicant')}-bundle.zip`;
      const res = await API.get(`/applications/${targetApp._id}/download-bundle`, {
        params: { downloadName: preferredName },
        responseType: 'blob',
      });
      triggerBlobDownload(res.data, preferredName);
    } catch {
      alert('Download failed');
    }
  };

  const handleUniStatusChange = async (appId, uniId, newStatus) => {
    try {
      const res = await API.put(`/applications/${appId}/university-status`, { universityId: uniId, status: newStatus });
      setSelectedApp(res.data.data);
      setData(prev => prev.map(a => a._id === appId ? res.data.data : a));
    } catch {
      alert('Failed to update status');
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
      
      setHistoryLoading(true);
      const historyRes = await API.get(`/applications/admin/list?userId=${userId}`);
      setStudentHistory(historyRes.data?.data || []);
    } catch {
      alert('Failed to load profile');
    } finally {
      setStudentLoading(false);
      setHistoryLoading(false);
    }
  };

  const toggleUniInApp = async (appId, uniId) => {
    const currentOffered = selectedApp.offeredUniversities || [];
    const targetUniId = normalizeId(uniId);
    const isOffered = currentOffered.some(u => normalizeId(u?.university?._id || u?.university) === targetUniId);
    const newList = isOffered 
      ? currentOffered.filter(u => normalizeId(u?.university?._id || u?.university) !== targetUniId)
      : [...currentOffered, { university: targetUniId, status: 'Applied' }];
    try {
      const res = await API.put(`/applications/${appId}`, { offeredUniversities: newList });
      setSelectedApp(res.data.data);
      setData(prev => prev.map(a => a._id === appId ? res.data.data : a));
    } catch {
      alert('Failed to update universities');
    }
  };

  const handleSelectAll = (e) => {
    if (e.target.checked) setSelectedIds(data.map(app => app._id));
    else setSelectedIds([]);
  };

  const handleSelectOne = (appId) => {
    setSelectedIds(prev => prev.includes(appId) ? prev.filter(id => id !== appId) : [...prev, appId]);
  };

  const handleBulkStatusUpdate = async (newStatus) => {
    if (!newStatus || selectedIds.length === 0) return;
    if (!window.confirm(`Update status to "${newStatus}" for ${selectedIds.length} applicants?`)) return;
    try {
      setLoading(true);
      await API.put('/applications/bulk-status', { ids: selectedIds, status: newStatus });
      setData(prev => prev.map(app => selectedIds.includes(app._id) ? { ...app, status: newStatus } : app));
      setSelectedIds([]);
      alert('Bulk update successful');
    } catch {
      alert('Bulk update failed');
    } finally {
      setLoading(false);
    }
  };

  const allPrograms = useMemo(() => {
    return [...new Set(data.flatMap(app => app.selectedPrograms?.map(p => p.programName) || []))].sort();
  }, [data]);

  const getPageNumbers = () => {
    const total = serverPagination.totalPages || 1;
    const pages = [];
    for (let i = 1; i <= total; i++) pages.push(i);
    return pages;
  };

  const filterSelectStyle = {
    padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-card)', 
    color: 'var(--text-primary)', minWidth: '140px', outline: 'none', fontSize: '13px'
  };

  const getPersonalInfo = (student) => student?.education?.personalInfo || {};

  const renderIdentityBlock = () => {
    if (!studentData) return null;
    const personalInfo = getPersonalInfo(studentData);
    
    return (
      <div className="identity-wrapper" style={{ marginBottom: 25 }}>
        <div className="identity-summary" style={{ padding: '24px', background: '#F8FAFC', borderRadius: 20, border: '1px solid var(--border)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 20 }}>
          <div className="form-group"><label style={{ fontSize: 10, fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>Full Name</label><input type="text" value={studentData?.name || ''} onChange={e => setStudentData({...studentData, name: e.target.value})} style={{ width: '100%', marginTop: 6, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)' }} /></div>
          <div className="form-group"><label style={{ fontSize: 10, fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>Father Name</label><input type="text" value={personalInfo?.fatherName || studentData?.fatherName || ''} onChange={e => handleEduChange('personalInfo', 'fatherName', e.target.value)} style={{ width: '100%', marginTop: 6, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)' }} /></div>
          <div className="form-group"><label style={{ fontSize: 10, fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>Date Of Birth</label><input type="text" value={(personalInfo?.dateOfBirth || studentData?.dateOfBirth)?.split('T')?.[0] || ''} onChange={e => handleEduChange('personalInfo', 'dateOfBirth', e.target.value)} style={{ width: '100%', marginTop: 6, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)' }} /></div>
          <div className="form-group"><label style={{ fontSize: 10, fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>Contact Number</label><input type="text" value={personalInfo?.fatherContactNumber || studentData?.phone || ''} onChange={e => handleEduChange('personalInfo', 'fatherContactNumber', e.target.value)} style={{ width: '100%', marginTop: 6, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)' }} /></div>
          <div className="form-group"><label style={{ fontSize: 10, fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>User CNIC / ID</label><input type="text" value={studentData?.education?.nationalId?.idNumber || ''} onChange={e => handleEduChange('nationalId', 'idNumber', e.target.value)} style={{ width: '100%', marginTop: 6, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)' }} /></div>
          <div className="form-group"><label style={{ fontSize: 10, fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>Father CNIC</label><input type="text" value={personalInfo?.fatherCnicNumber || ''} onChange={e => handleEduChange('personalInfo', 'fatherCnicNumber', e.target.value)} style={{ width: '100%', marginTop: 6, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)' }} /></div>
        </div>
      </div>
    );
  };

    const renderEducationSection = (title, section, fields) => {
      if (!studentData) return null;
      // Always use LIVE data for admin editing — snapshots are only for PDF generation
      const eduData = studentData?.education?.[section] || {};
      
      return (
        <div key={section} className="edu-mgmt-section" style={{ marginBottom: 30, padding: 28, background: '#ffffff', borderRadius: 20, border: '1px solid #eef2f6', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 25, paddingBottom: 15, borderBottom: '1.5px solid #f1f5f9' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>{section === 'nationalId' ? '👤' : (section === 'personalInfo' ? '👨‍👩‍👧‍👦' : '📜')}</div>
              <h4 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#1e293b' }}>{section === 'nationalId' ? 'Identity & Profile' : (section === 'personalInfo' ? 'Family & Personal' : title)}</h4>
            </div>
            {eduData.enabled && <span className="badge badge-active" style={{ fontSize: 11, padding: '4px 12px', borderRadius: 8, border: '1px solid #166534', color: '#166534', background: 'transparent', fontWeight: 800 }}>Verified Section</span>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 15, marginBottom: 20 }}>
            {section === 'nationalId' ? (
              <>
                <div className="info-field">
                  <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>State / Province</label>
                  <select 
                    value={studentData?.state || ''} 
                    onChange={e => setStudentData({...studentData, state: e.target.value, city: ''})} 
                    style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 12, background: 'white' }}
                  >
                    <option value="">Select State</option>
                    {getStates(ADMIN_COUNTRY).map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="info-field">
                  <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>City / Location</label>
                  <select 
                    value={studentData?.city || ''} 
                    onChange={e => setStudentData({...studentData, city: e.target.value})} 
                    disabled={!studentData?.state}
                    style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 12, background: 'white', opacity: !studentData?.state ? 0.6 : 1 }}
                  >
                    <option value="">Select City</option>
                    {studentData?.state && getCities(ADMIN_COUNTRY, studentData?.state).map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="info-field"><label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Home Address</label><input type="text" value={studentData?.address || ''} onChange={e => setStudentData({...studentData, address: e.target.value})} style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 12 }} /></div>
              </>
            ) : section === 'personalInfo' ? (
              <>
                <div className="info-field"><label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Father's Name</label><input type="text" value={eduData.fatherName || ''} onChange={e => handleEduChange(section, 'fatherName', e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 12 }} /></div>
                <div className="info-field"><label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>CNIC Number</label><input type="text" value={eduData.cnicNumber || ''} onChange={e => handleEduChange(section, 'cnicNumber', e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 12 }} /></div>
                <div className="info-field"><label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Date of Birth</label><input type="text" value={eduData.dateOfBirth || ''} onChange={e => handleEduChange(section, 'dateOfBirth', e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 12 }} /></div>
                <div className="info-field"><label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Father Contact</label><input type="text" value={eduData.fatherContactNumber || ''} onChange={e => handleEduChange(section, 'fatherContactNumber', e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 12 }} /></div>
                <div className="info-field"><label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Father CNIC</label><input type="text" value={eduData.fatherCnicNumber || ''} onChange={e => handleEduChange(section, 'fatherCnicNumber', e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 12 }} /></div>
              </>
            ) : (
              (section === 'matric' || section === 'intermediate' || section === 'bachelor' || section === 'masters') && (
                <>
                  <div className="info-field">
                    <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Institute State / Province</label>
                    <select value={eduData.state || ''} onChange={e => { handleEduChange(section, 'state', e.target.value); handleEduChange(section, 'city', ''); }} style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 12, background: 'white' }}>
                      <option value="">Select State</option>
                      {getStates(ADMIN_COUNTRY).map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="info-field">
                    <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Institute City / Location</label>
                    <select value={eduData.city || ''} onChange={e => handleEduChange(section, 'city', e.target.value)} disabled={!eduData.state} style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 12, background: 'white', opacity: !eduData.state ? 0.6 : 1 }}>
                      <option value="">Select City</option>
                      {eduData.state && getCities(ADMIN_COUNTRY, eduData.state).map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="info-field"><label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>{section === 'matric' || section === 'intermediate' ? 'School/College' : 'Degree Name'}</label><input type="text" value={eduData.schoolName || eduData.collegeName || eduData.degreeName || ''} onChange={e => handleEduChange(section, section === 'matric' ? 'schoolName' : (section === 'intermediate' ? 'collegeName' : 'degreeName'), e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 12 }} /></div>
                  <div className="info-field"><label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Passing Year</label><input type="text" value={eduData.passingYear || ''} onChange={e => handleEduChange(section, 'passingYear', e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 12 }} /></div>
                  <div className="info-field"><label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Grade / CGPA</label><input type="text" value={eduData.grade || ''} onChange={e => handleEduChange(section, 'grade', e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 12 }} /></div>
                </>
              )
            )}
          </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20 }}>
          {fields.map(f => {
            const fileName = f.isPersonalInfo ? studentData?.education?.personalInfo?.[f.key] : eduData[f.key];
            return (
              <div key={f.key} className="doc-tile" style={{ padding: '20px', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 15 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><div>{fileName ? '📄' : '⭕'}</div><div><div style={{ fontSize: 13, fontWeight: 800 }}>{f.label}</div></div></div>
                </div>
                {fileName ? (
                  <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(3, 1fr)' }}>
                    <button 
                      onClick={() => handleDownloadEduDoc(studentData?._id, f.isPersonalInfo ? 'personalInfo' : section, f.key, fileName)}
                      style={{ textAlign: 'center', padding: '8px', background: '#10B981', color: 'white', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}
                    >
                      View
                    </button>
                    <button onClick={() => handleDocUpload(f.isPersonalInfo ? 'personalInfo' : section, f.key)} style={{ padding: '8px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 8, cursor: 'pointer', fontWeight: 700 }}>Change</button>
                    <button onClick={() => deleteDoc(f.isPersonalInfo ? 'personalInfo' : section, f.key)} style={{ padding: '8px', background: '#fff1f2', border: '1px solid #fecaca', borderRadius: 8, cursor: 'pointer', color: '#dc2626', fontWeight: 700 }}>Del</button>
                  </div>
                ) : ( <button onClick={() => handleDocUpload(f.isPersonalInfo ? 'personalInfo' : section, f.key)} style={{ width: '100%', padding: '10px', background: 'white', border: '2px dashed #cbd5e1', borderRadius: '12px', color: '#64748b', fontWeight: 700, cursor: 'pointer' }}>Upload PDF</button> )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="applicants-page" style={{ padding: '0', width: '100%' }}>
      <div className="table-card" style={{ border: 'none', background: 'transparent', margin: 0 }}>
        <div className="table-header" style={{ padding: '24px', background: '#ffffff', borderRadius: '20px 20px 0 0', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
            <div>
              <h2 style={{ margin: 0 }}>👥 Applicants List</h2>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>Managing students for: <strong>{targetName}</strong></p>
            </div>
            <div style={{ background: 'var(--primary-light)', padding: '10px 20px', borderRadius: 12, fontWeight: 800, color: 'var(--primary)' }}>
              Total: {data.length} Applicants
            </div>
          </div>
        </div>

        <div className="filter-bar" style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', padding: '16px 24px', background: '#ffffff' }}>
          <input type="text" placeholder="Search name or email..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={{ ...filterSelectStyle, flex: 1 }} />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={filterSelectStyle}><option value="">All Statuses</option>{ALL_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}</select>
          <select value={filterCity} onChange={(e) => setFilterCity(e.target.value)} style={filterSelectStyle}><option value="">All Cities</option>{allCities.map(c => <option key={c} value={c}>{c}</option>)}</select>
          <select value={programFilter} onChange={(e) => setProgramFilter(e.target.value)} style={filterSelectStyle}><option value="">All Programs</option>{allPrograms.map(p => <option key={p} value={p}>{p}</option>)}</select>
        </div>

        <div className="table-scroll-wrap">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={tableHeaderCell}>#</th>
                <th style={tableHeaderCell}>Student Info</th>
                <th style={tableHeaderCell}>Location</th>
                <th style={tableHeaderCell}>Applied For</th>
                <th style={tableHeaderCell}>Status</th>
                <th style={tableHeaderCell}>Date</th>
                <th style={{ ...tableHeaderCell, textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? ( <tr><td colSpan="7" style={{ textAlign: 'center', padding: '40px' }}>Loading...</td></tr> ) : data.length === 0 ? ( <tr><td colSpan="7" style={{ textAlign: 'center', padding: '40px' }}>No applicants found.</td></tr> ) : (
                data.map((app, idx) => (
                  <tr key={app._id}>
                    <td style={tableBodyCell}>{((currentPage - 1) * serverPagination.limit) + idx + 1}</td>
                    <td style={tableBodyCell}>
                       <div style={{ fontWeight: 800 }}>{app.user?.name}</div>
                       <div style={{ fontSize: 11, opacity: 0.6 }}>{app.user?.email}</div>
                    </td>
                    <td style={tableBodyCell}>{app.user?.city || 'N/A'}</td>
                    <td style={tableBodyCell}><div style={{ fontSize: 11, fontWeight: 700 }}>{app.selectedPrograms?.map(p => p.programName).join(', ') || 'N/A'}</div></td>
                    <td style={tableBodyCell}>
                       <select 
                         value={app.status} 
                         onChange={(e) => handleStatusChange(app._id, e.target.value)} 
                         style={{ 
                           padding: '4px 8px', 
                           borderRadius: 6, 
                           fontSize: 10, 
                           fontWeight: 800,
                           color: getStatusColor(app.status),
                           border: `1.5px solid ${getStatusColor(app.status)}`,
                           background: 'white',
                           cursor: 'pointer',
                           outline: 'none'
                         }}
                       >
                          {ALL_STATUSES.map(s => <option key={s} value={s} style={{ color: '#000' }}>{s}</option>)}
                       </select>
                    </td>
                    <td style={tableBodyCell}>{new Date(app.appliedAt).toLocaleDateString()}</td>
                    <td style={tableBodyCell}>
                       <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, width: '140px', margin: '0 auto' }}>
                          <button onClick={() => openStudentModal(app)} style={{ ...compactActionButtonStyle, background: '#4F46E5', color: 'white' }}>VIEW</button>
                          <button onClick={() => { setSelectedApp(app); setShowModal(true); }} style={{ ...compactActionButtonStyle, background: '#D97706', color: 'white' }}>EDIT</button>
                          <button onClick={() => handleDownloadFullBundle(app)} style={{ ...compactActionButtonStyle, background: '#0F766E', color: 'white' }}>ZIP</button>
                          <button onClick={() => deleteApplication(app._id)} style={{ ...compactActionButtonStyle, background: '#fee2e2', color: '#ef4444' }}>DEL</button>
                       </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="pagination-container" style={{ display: 'flex', justifyContent: 'center', gap: '8px', padding: '20px' }}>
          {getPageNumbers().map(num => ( <button key={num} onClick={() => setCurrentPage(num)} style={{ width: 36, height: 36, borderRadius: 8, background: currentPage === num ? 'var(--primary)' : 'white', color: currentPage === num ? 'white' : 'black', border: '1px solid var(--border)', cursor: 'pointer' }}>{num}</button> ))}
        </div>
      </div>

      {showStudentModal && studentData && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '900px', width: '95%', maxHeight: '90vh', overflow: 'hidden' }}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 15 }}>
                <div className="admin-avatar" style={{ width: 50, height: 50, background: 'var(--primary)' }}>{studentData?.name?.charAt(0)}</div>
                <div><h3 style={{ margin: 0 }}>Student Profile</h3><span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{studentData?.email}</span></div>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={saveStudentProfile} disabled={isSavingStudent} style={{ padding: '10px 20px', background: '#6366f1', color: 'white', border: 'none', borderRadius: 12, fontWeight: 800, cursor: 'pointer', opacity: isSavingStudent ? 0.7 : 1 }}>{isSavingStudent ? 'Saving...' : '💾 Save Changes'}</button>
                <button className="btn-close" onClick={() => setShowStudentModal(false)}>✕</button>
              </div>
            </div>
            <div className="modal-tabs" style={{ display: 'flex', padding: '0 24px', borderBottom: '1px solid var(--border)', gap: 30, overflowX: 'auto' }}>
              {['Account', 'Personal', 'Education'].map(tab => ( 
                <button 
                  key={tab} 
                  onClick={() => setActiveTab(tab.toLowerCase().replace(' ', ''))} 
                  style={{ 
                    padding: '15px 0', 
                    background: 'none', 
                    border: 'none', 
                    borderBottom: activeTab === tab.toLowerCase().replace(' ', '') ? '3px solid var(--primary)' : '3px solid transparent', 
                    color: activeTab === tab.toLowerCase().replace(' ', '') ? 'var(--primary)' : '#64748b', 
                    fontWeight: 700, 
                    cursor: 'pointer',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {tab}
                </button> 
              ))}
            </div>
            <div className="modal-body" style={{ maxHeight: 'calc(90vh - 160px)', overflowY: 'auto', padding: 24 }}>
              {activeTab === 'account' ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
                  <div className="form-group"><label>Name</label><input type="text" value={studentData?.name || ''} onChange={e => setStudentData({...studentData, name: e.target.value})} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #ddd' }} /></div>
                  <div className="form-group"><label>Email</label><input type="email" value={studentData?.email || ''} onChange={e => setStudentData({...studentData, email: e.target.value})} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #ddd' }} /></div>
                  <div className="form-group"><label>Phone</label><input type="text" value={studentData?.phone || ''} onChange={e => setStudentData({...studentData, phone: e.target.value})} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #ddd' }} /></div>
                  <div className="form-group"><label>New Password (Leave blank to keep same)</label><input type="password" placeholder="••••••••" value={studentData?.password || ''} onChange={e => setStudentData({...studentData, password: e.target.value})} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #ddd' }} /></div>
                </div>
              ) : activeTab === 'personal' ? (
                <div className="education-mgmt">
                  {renderEducationSection('Personal Information', 'personalInfo', [
                    { key: 'fatherCnicFile', label: 'Father CNIC Doc', isPersonalInfo: true }
                  ])}
                </div>
              ) : activeTab === 'education' ? (
                <div className="education-mgmt">
                  {renderIdentityBlock()}
                  {renderEducationSection('National ID / Identity', 'nationalId', [
                    { key: 'file', label: 'ID Card PDF' }
                  ])}
                  {renderEducationSection('Matric / O-Level', 'matric', [{ key: 'transcript', label: 'Transcript' }, { key: 'certificate', label: 'Certificate' }])}
                  {renderEducationSection('Intermediate / A-Level', 'intermediate', [{ key: 'transcript', label: 'Transcript' }, { key: 'certificate', label: 'Certificate' }])}
                  {renderEducationSection('Bachelor Degree', 'bachelor', [{ key: 'transcript', label: 'Transcript' }, { key: 'certificate', label: 'Certificate' }])}
                  {renderEducationSection('Masters Degree', 'masters', [{ key: 'transcript', label: 'Transcript' }, { key: 'certificate', label: 'Certificate' }])}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {showModal && selectedApp && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '700px', width: '90%', overflow: 'hidden' }}>
            <div className="modal-header"><h3 style={{ margin: 0 }}>🏛️ Admission Documents</h3><button className="btn-close" onClick={() => setShowModal(false)}>✕</button></div>
            <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto', padding: 20 }}>
               {type === 'scholarship' && (
                 <div className="uni-manage-list">
                    {linkedUnivs.map(uni => {
                      const uniId = normalizeId(uni._id || uni);
                      const offeredData = selectedApp.offeredUniversities?.find(u => normalizeId(u?.university?._id || u?.university) === uniId);
                      const isOffered = !!offeredData;
                      return (
                        <div key={uniId} style={{ padding: 12, border: '1px solid #eee', borderRadius: 10, marginBottom: 8, background: isOffered ? '#f0f9ff' : 'transparent' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><input type="checkbox" checked={isOffered} onChange={() => toggleUniInApp(selectedApp._id, uniId)} /><span style={{ fontWeight: 700 }}>{uni.name}</span></div>
                            {isOffered && ( 
                              <select 
                                value={offeredData.status} 
                                onChange={(e) => handleUniStatusChange(selectedApp._id, uniId, e.target.value)} 
                                style={{ 
                                  padding: '4px 8px', 
                                  borderRadius: 6,
                                  fontSize: 10,
                                  fontWeight: 800,
                                  color: getStatusColor(offeredData.status),
                                  border: `1.5px solid ${getStatusColor(offeredData.status)}`,
                                  background: 'white'
                                }}
                              >
                                {ALL_STATUSES.map(s => <option key={s} value={s} style={{ color: '#000' }}>{s}</option>)}
                              </select> 
                            )}
                          </div>
                          {isOffered && (
                            <div style={{ marginTop: 15, display: 'flex', flexDirection: 'column', gap: 12, paddingLeft: 25 }}>
                               {['admitCard', 'offerLetter'].map(field => (
                                 <div key={field} style={{ background: '#fff', padding: 12, borderRadius: 12, border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                                    <div>
                                       <label style={{ fontSize: 9, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>{field === 'admitCard' ? 'Admit Card' : 'Offer Letter'}</label>
                                       {offeredData[field] && <div style={{ fontSize: 10, fontWeight: 600, color: '#475569', ...oneLineEllipsisStyle, maxWidth: '150px' }}>📎 {getStoredFileName(offeredData[field])}</div>}
                                    </div>
                                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                       <button onClick={() => handleFileUpload(selectedApp._id, field, uniId)} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: 10, fontWeight: 700, background: offeredData[field] ? '#dcfce7' : '#f8fafc' }}>
                                          {offeredData[field] ? 'Change' : 'Upload'}
                                       </button>
                                       {offeredData[field] && (
                                         <>
                                            <button 
                                               onClick={() => handleDownloadAppDoc(selectedApp._id, field, offeredData[field], uniId)}
                                               style={{ padding: '6px 12px', background: '#10B981', color: 'white', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 10, fontWeight: 700 }}
                                            >
                                               View
                                            </button>
                                            <button onClick={() => handleDeleteUniDoc(selectedApp._id, uniId, field)} style={{ padding: '6px 12px', background: '#fff1f2', border: '1px solid #fecaca', borderRadius: 8, color: '#dc2626', fontSize: 10, fontWeight: 700 }}>Del</button>
                                         </>
                                       )}
                                    </div>
                                 </div>
                               ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                 </div>
               )}
               <div style={{ borderTop: '1px solid #eee', marginTop: 20, paddingTop: 20 }}>
                  <h4 style={{ marginBottom: 15 }}>General Documents</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
                     {['admitCard', 'offerLetter'].map(field => (
                       <div key={field} style={{ padding: 18, border: '1px solid #e2e8f0', borderRadius: 16, background: '#f8fafc' }}>
                          <label style={{ fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: 12 }}>{field === 'admitCard' ? 'ADMIT CARD' : 'OFFER LETTER'}</label>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
                             <button onClick={() => handleFileUpload(selectedApp._id, field)} style={{ padding: '10px 20px', borderRadius: 10, background: selectedApp[field] ? '#10B981' : 'white', color: selectedApp[field] ? 'white' : 'black', border: '1.5px solid #e2e8f0', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>
                                {selectedApp[field] ? '🔄 Change File' : '+ Upload PDF'}
                             </button>
                             {selectedApp[field] && (
                                <>
                                  <span style={{ fontSize: 12, color: '#475569', fontWeight: 600, flex: '1 1 200px', ...oneLineEllipsisStyle }} title={getStoredFileName(selectedApp[field])}>
                                     📎 {getStoredFileName(selectedApp[field])}
                                  </span>
                                  <div style={{ display: 'flex', gap: 6 }}>
                                     <button 
                                       onClick={() => handleDownloadAppDoc(selectedApp._id, field, selectedApp[field])}
                                       style={{ padding: '8px 16px', background: 'white', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', color: '#1e293b' }}
                                     >
                                       View
                                     </button>
                                     <button onClick={() => handleDeleteAppDoc(selectedApp._id, field)} style={{ padding: '8px 16px', background: '#fff1f2', border: '1px solid #fecaca', borderRadius: 8, color: '#dc2626', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Delete</button>
                                  </div>
                                </>
                             )}
                          </div>
                       </div>
                     ))}
                  </div>
               </div>
            </div>
            <div className="modal-footer" style={{ padding: 20, textAlign: 'right' }}><button onClick={() => setShowModal(false)} style={{ padding: '10px 30px', background: 'black', color: 'white', borderRadius: 8, border: 'none', cursor: 'pointer' }}>Done</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
