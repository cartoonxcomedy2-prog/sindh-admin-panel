import React, { useEffect, useState, useMemo, useCallback } from 'react';
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
  return matched[0].replace(/[\]),.;.]+$/g, '');
};

const getFileUrl = (fileName) => {
  if (!fileName) return '';
  const raw = unwrapFileValue(fileName);
  const embedded = extractEmbeddedUrl(raw);
  
  // 1. Handle Cloudinary URLs
  if (embedded && embedded.includes('cloudinary.com')) {
    let url = embedded;
    const isDocument = /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|txt|csv)$/i.test(url.split('?')[0])
      || url.includes('/raw/upload/')
      || url.includes('fl_attachment');
    
    // Convert image documents to raw for Cloudinary
    if (isDocument && url.includes('/image/upload/')) {
      url = url.replace('/image/upload/', '/raw/upload/');
    }
    return url;
  }

  // 2. Handle Local Storage Paths (e.g. /uploads/banners/file.jpg)
  let cleanPath = raw;
  if (cleanPath.includes('uploads/')) {
    cleanPath = cleanPath.split('uploads/').pop();
  }
  if (cleanPath.startsWith('/')) cleanPath = cleanPath.slice(1);

  // Prepend backend base URL for local files
  const server = API.defaults.baseURL.replace(/\/api\/?$/, '');
  return `${server}/uploads/${cleanPath}`;
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

const inferFileExtension = (value, fallback = '.pdf') => {
  const raw = unwrapFileValue(value);
  if (!raw) return fallback;

  let pathname = raw;
  const embedded = extractEmbeddedUrl(raw);
  if (embedded) {
    try {
      pathname = new URL(embedded).pathname || raw;
    } catch {
      pathname = embedded;
    }
  }

  const dotIndex = pathname.lastIndexOf('.');
  if (dotIndex === -1) return fallback;
  const ext = pathname.substring(dotIndex).toLowerCase();
  if (!ext || ext.length > 10) return fallback;
  return ext;
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

export default function AdminApplications() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [filterCity, setFilterCity] = useState('');
  const [levelFilter, setLevelFilter] = useState('');
  const [selectedIds, setSelectedIds] = useState([]); // For bulk actions
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
  const [showModal, setShowModal] = useState(false); // For Manage Universities (Scholarships)
  const [selectedApp, setSelectedApp] = useState(null);
  const [linkedUnivs, setLinkedUnivs] = useState([]);
  const [modalLoading, setModalLoading] = useState(false);

  // New Student Details Modal State
  const [showStudentModal, setShowStudentModal] = useState(false);
  const [studentData, setStudentData] = useState({});
  const [studentLoading, setStudentLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('account');
  const [isSavingStudent, setIsSavingStudent] = useState(false);
  const [studentHistory, setStudentHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

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
      // Refresh local data
      setData(prev => prev.map(app => 
        app.user?._id === studentData?._id ? { ...app, user: studentData } : app
      ));
    } catch (err) {
      console.error('Failed to update profile:', err);
      alert('Update failed: ' + (err.response?.data?.message || err.message));
    } finally {
      setIsSavingStudent(false);
    }
  };
  const [currentAppForModal, setCurrentAppForModal] = useState(null);

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
      const res = await API.get('/applications/admin/list', {
        params: {
          page: currentPage,
          limit: serverPagination.limit,
          search: searchTerm || undefined,
          status: statusFilter || undefined,
          city: filterCity || undefined,
          level: levelFilter || undefined,
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
      setServerPagination((prev) => ({
        ...prev,
        total: 0,
        totalPages: 1,
      }));
    } finally {
      setLoading(false);
    }
  }, [
    currentPage,
    serverPagination.limit,
    searchTerm,
    statusFilter,
    filterCity,
    levelFilter,
    startDate,
    endDate,
  ]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchApplicants();
    }, 200);
    return () => clearTimeout(timer);
  }, [fetchApplicants]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, filterCity, levelFilter, startDate, endDate]);

  useEffect(() => {
    const total = Math.max(serverPagination.totalPages || 1, 1);
    if (currentPage > total) {
      setCurrentPage(total);
    }
  }, [currentPage, serverPagination.totalPages]);

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
          uploadFile = await imageCompression(file, options);
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
        alert(`Upload failed: ${parseApiErrorMessage(err, 'Unable to upload file')}`);
      }
    };
    input.click();
  };

  const handleDownloadAppDoc = (appId, field, fileName, uniId = null) => {
    const displayLabel = field === 'admitCard' ? 'Admit_Card' : 'Offer_Letter';
    const baseExt = (fileName && typeof fileName === 'string' && fileName.toLowerCase().endsWith('.pdf')) ? '.pdf' : '.pdf'; // Force PDF
    const fallbackName = `${displayLabel}_${Date.now()}${baseExt}`;
    
    API.get(`/applications/${appId}/download-doc/${field}`, {
      params: { 
        downloadName: fallbackName,
        universityId: uniId || undefined
      },
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
        const res = await API.put(`/users/${studentData?._id}/education`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        setStudentData({ ...(res.data.data || {}), country: ADMIN_COUNTRY });
        alert('Document uploaded');
        fetchApplicants();
      } catch (err) {
        alert(`Upload failed: ${parseApiErrorMessage(err, 'Unable to upload document')}`);
      }
    };
    input.click();
  };

  const deleteDoc = async (section, field) => {
    if (!window.confirm(`Delete ${field} for ${section}?`)) return;
    try {
      await API.delete(`/users/${studentData?._id}/education/${section}/${field}`);
      // Refetch user to show update
      const userRes = await API.get(`/users/${studentData?._id}`);
      setStudentData({ ...(userRes.data.data || {}), country: ADMIN_COUNTRY });
      alert('Document deleted');
      fetchApplicants();
    } catch (err) {
      alert(`Delete failed: ${parseApiErrorMessage(err, 'Unable to delete document')}`);
    }
  };

  const handleDeleteUniDoc = async (appId, uniId, field) => {
    if (!window.confirm(`Delete ${field === 'admitCard' ? 'Admit Card' : 'Offer Letter'} for this university?`)) {
      return;
    }

    try {
      const payload = { universityId: uniId, [field]: null };
      const res = await API.put(`/applications/${appId}/university-status`, payload);
      setSelectedApp(res.data.data);
      setData((prev) => prev.map((a) => (a._id === appId ? res.data.data : a)));
    } catch (err) {
      console.error('Offered university doc delete failed:', err);
      alert('Failed to delete university document');
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
      
      setHistoryLoading(true);
      const historyRes = await API.get(`/applications/admin/list?userId=${userId}`);
      setStudentHistory(historyRes.data?.data || []);
    } catch (err) {
      console.error('Student profile fetch failed:', err);
    } finally {
      setStudentLoading(false);
      setHistoryLoading(false);
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
    const targetUniId = normalizeId(uniId);
    const isOffered = currentOffered.some(
      (u) => normalizeId(u?.university?._id || u?.university) === targetUniId
    );
    
    let newList;
    if (isOffered) {
      newList = currentOffered.filter(
        (u) => normalizeId(u?.university?._id || u?.university) !== targetUniId
      );
    } else {
      newList = [...currentOffered, { university: targetUniId, status: 'Applied' }];
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

  // Server returns already filtered and paginated rows.
  const filteredData = useMemo(() => data, [data]);

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
  const currentItems = filteredData;
  const totalPages = Math.max(serverPagination.totalPages || 1, 1);

  // Frontend Clustering by User
  const groupedUsers = useMemo(() => {
    const map = {};
    currentItems.forEach(app => {
      const uid = app.user?._id;
      if (!uid) return;
      if (!map[uid]) {
        map[uid] = {
          user: app.user,
          applications: [],
          latestDate: app.appliedAt,
        };
      }
      map[uid].applications.push(app);
      if (new Date(app.appliedAt) > new Date(map[uid].latestDate)) {
        map[uid].latestDate = app.appliedAt;
      }
    });
    return Object.values(map);
  }, [currentItems]);

  const [expandedUserIds, setExpandedUserIds] = useState(new Set());

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

  const toggleUserExpand = (uid) => {
    setExpandedUserIds(prev => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

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
    minWidth: 62,
    height: 30,
    borderRadius: 8,
    padding: '0 10px',
    border: 'none',
    fontWeight: 700,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    lineHeight: 1,
  };

  const getPersonalInfo = (student) => student?.education?.personalInfo || {};

  const renderIdentityBlock = () => {
    if (!studentData) return null;
    const personalInfo = getPersonalInfo(studentData);
    
    return (
      <div className="identity-wrapper" style={{ marginBottom: 25 }}>
        <div
          className="identity-summary"
          style={{
            padding: '24px',
            background: '#F8FAFC',
            borderRadius: 20,
            border: '1px solid var(--border)',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 20,
          }}
        >
          <div className="form-group">
            <label style={{ fontSize: 10, fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>Full Name</label>
            <input 
              type="text" 
              value={studentData?.name || ''} 
              onChange={e => setStudentData({...studentData, name: e.target.value})}
              style={{ width: '100%', marginTop: 6, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)' }}
            />
          </div>
          <div className="form-group">
            <label style={{ fontSize: 10, fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>Father Name</label>
            <input 
              type="text" 
              value={personalInfo?.fatherName || studentData?.fatherName || ''} 
              onChange={e => handleEduChange('personalInfo', 'fatherName', e.target.value)}
              style={{ width: '100%', marginTop: 6, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)' }}
            />
          </div>
          <div className="form-group">
            <label style={{ fontSize: 10, fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>Date Of Birth</label>
            <input 
              type="text" 
              value={(personalInfo?.dateOfBirth || studentData?.dateOfBirth)?.split('T')?.[0] || ''} 
              onChange={e => handleEduChange('personalInfo', 'dateOfBirth', e.target.value)}
              style={{ width: '100%', marginTop: 6, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)' }}
            />
          </div>
          <div className="form-group">
            <label style={{ fontSize: 10, fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>Contact Number</label>
            <input 
              type="text" 
              value={personalInfo?.fatherContactNumber || studentData?.phone || ''} 
              onChange={e => handleEduChange('personalInfo', 'fatherContactNumber', e.target.value)}
              style={{ width: '100%', marginTop: 6, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)' }}
            />
          </div>
          <div className="form-group">
            <label style={{ fontSize: 10, fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>User CNIC / ID</label>
            <input 
              type="text" 
              value={studentData?.education?.nationalId?.idNumber || ''} 
              onChange={e => handleEduChange('nationalId', 'idNumber', e.target.value)}
              style={{ width: '100%', marginTop: 6, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)' }}
            />
          </div>
          <div className="form-group">
            <label style={{ fontSize: 10, fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>Father CNIC</label>
            <input 
              type="text" 
              value={personalInfo?.fatherCnicNumber || ''} 
              onChange={e => handleEduChange('personalInfo', 'fatherCnicNumber', e.target.value)}
              style={{ width: '100%', marginTop: 6, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)' }}
            />
          </div>
        </div>
      </div>
    );
  };

  const renderEducationSection = (title, section, fields) => {
    if (!studentData) return null;
    // Always use LIVE data for admin editing — snapshots are only for PDF generation
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
              <div className="form-group">
                <label style={{ fontSize: 10, color: '#64748B', fontWeight: 700 }}>State / Province</label>
                <select 
                  value={studentData?.state || ''} 
                  onChange={e => setStudentData({...studentData, state: e.target.value, city: ''})} 
                  style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 12, background: 'white' }}
                >
                  <option value="">Select State</option>
                  {getStates(ADMIN_COUNTRY).map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label style={{ fontSize: 10, color: '#64748B', fontWeight: 700 }}>City / Location</label>
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
              <div className="form-group">
                <label style={{ fontSize: 10, color: '#64748B', fontWeight: 700 }}>Home Address</label>
                <input type="text" value={studentData?.address || ''} onChange={e => setStudentData({...studentData, address: e.target.value})} style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 12 }} />
              </div>
              <div className="info-field">
                <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>NIC / ID Number</label>
                <input 
                  type="text" 
                  value={studentData?.education?.nationalId?.idNumber || ''} 
                  onChange={e => handleEduChange('nationalId', 'idNumber', e.target.value)}
                  style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12 }}
                />
              </div>
            </>
          )}
          
          {(section === 'matric' || section === 'intermediate' || section === 'bachelor' || section === 'masters') && (
            <>
              <div className="info-field">
                <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Institute State / Province</label>
                <select value={eduData.state || ''} onChange={e => { handleEduChange(section, 'state', e.target.value); handleEduChange(section, 'city', ''); }} style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12, background: 'white' }}>
                  <option value="">Select State</option>
                  {getStates(ADMIN_COUNTRY).map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="info-field">
                <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Institute City / Location</label>
                <select value={eduData.city || ''} onChange={e => handleEduChange(section, 'city', e.target.value)} disabled={!eduData.state} style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12, background: 'white', opacity: !eduData.state ? 0.6 : 1 }}>
                  <option value="">Select City</option>
                  {eduData.state && getCities(ADMIN_COUNTRY, eduData.state).map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="info-field">
                <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                  {section === 'matric' || section === 'intermediate' ? 'School / College Name' : 'Previous Institute / University'}
                </label>
                <input 
                  type="text" 
                  value={eduData.schoolName || eduData.collegeName || eduData.instituteName || ''} 
                  onChange={e => {
                    const key = section === 'matric' ? 'schoolName' : (section === 'intermediate' ? 'collegeName' : 'instituteName');
                    handleEduChange(section, key, e.target.value);
                  }}
                  style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12 }}
                />
              </div>
              {(section === 'bachelor' || section === 'masters') && (
                <div className="info-field">
                  <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                    Degree Name
                  </label>
                  <input 
                    type="text" 
                    value={eduData.degreeName || ''} 
                    onChange={e => handleEduChange(section, 'degreeName', e.target.value)}
                    style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12 }}
                  />
                </div>
              )}
              <div className="info-field">
                <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Passing Year</label>
                <input 
                  type="text" 
                  value={eduData.passingYear || ''} 
                  onChange={e => handleEduChange(section, 'passingYear', e.target.value)}
                  style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12 }}
                />
              </div>
              <div className="info-field">
                <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Grade / CGPA</label>
                <input 
                  type="text" 
                  value={eduData.grade || ''} 
                  onChange={e => handleEduChange(section, 'grade', e.target.value)}
                  style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12 }}
                />
              </div>
            </>
          )}

          {section === 'international' && (
            <>
              <div className="info-field">
                <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Passport Number</label>
                <input 
                  type="text" 
                  value={eduData.passportNumber || ''} 
                  onChange={e => handleEduChange(section, 'passportNumber', e.target.value)}
                  style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12 }}
                />
              </div>
              <div className="info-field">
                <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>English Test</label>
                <input 
                  type="text" 
                  value={eduData.englishTestType || ''} 
                  onChange={e => handleEduChange(section, 'englishTestType', e.target.value)}
                  placeholder="Test Type (e.g. IELTS)"
                  style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12 }}
                />
              </div>
              <div className="info-field">
                <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Score</label>
                <input 
                  type="text" 
                  value={eduData.testScore || ''} 
                  onChange={e => handleEduChange(section, 'testScore', e.target.value)}
                  style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12 }}
                />
              </div>
            </>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 15 }}>
          {fields.map(f => {
            const fileName = f.isPersonalInfo ? (studentData?.education?.personalInfo?.[f.key]) : eduData[f.key];
            const displayLabel = `${studentData?.name}_${title}_${f.label}`.replace(/\s+/g, '_');
            const fallbackName = `${displayLabel}${inferFileExtension(fileName, '.pdf')}`;
            const displayNameWithExt = getStoredFileName(fileName, fallbackName);
            return (
              <div key={f.key} className="doc-tile" style={{ background: 'var(--bg-card)', padding: 15, borderRadius: 12, border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{f.label}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 6 }}>
                  <span className={`badge ${fileName ? 'badge-active' : ''}`} style={{ fontSize: 10 }}>
                    {fileName ? 'Uploaded' : 'Pending'}
                  </span>
                </div>
                {fileName && (
                  <div
                    style={{
                      fontSize: 11,
                      color: 'var(--text-secondary)',
                      marginBottom: 12,
                      opacity: 1,
                      fontWeight: 500,
                      ...oneLineEllipsisStyle,
                    }}
                    title={displayNameWithExt}
                  >
                    {displayNameWithExt}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {fileName ? (
                    <>
                      <button
                        className="btn-icon small"
                        title="View / Download PDF"
                        onClick={(e) => {
                          e.preventDefault();
                          const btn = e.currentTarget;
                          const originalText = btn.innerText;
                          btn.innerText = '...';
                          API.get(`/users/${studentData?._id}/education/${section}/${f.key}/download`, {
                            params: { downloadName: fallbackName },
                            responseType: 'blob'
                          }).then(res => {
                            if (res.data) triggerBlobDownload(res.data, fallbackName);
                            else throw new Error('Empty response');
                          })
                            .catch((err) => {
                               console.error('Download failed:', err);
                               const url = getFileUrl(fileName);
                               if (url) window.open(url, '_blank');
                               else alert('File URL not available');
                            })
                            .finally(() => btn.innerText = originalText);
                        }}
                        style={{ background: '#10B981', color: 'white', cursor: 'pointer', border: 'none', padding: '4px 8px', borderRadius: 6 }}
                      >
                        📄
                      </button>
                      <button
                        className="btn-icon small"
                        onClick={() => handleDocUpload(section, f.key)}
                        title="Change PDF"
                        style={{ background: '#6366F1', color: 'white', padding: '4px 8px', borderRadius: 6 }}
                      >
                        🔄
                      </button>
                      <button
                        className="btn-icon small"
                        onClick={() => deleteDoc(section, f.key)}
                        title="Delete"
                        style={{ background: '#EF4444', color: 'white', padding: '4px 8px', borderRadius: 6 }}
                      >
                        🗑️
                      </button>
                    </>
                  ) : (
                    <button className="btn-publish" style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => handleDocUpload(section, f.key)}>
                      Upload PDF
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
    <div className="applicants-page" style={{ overflowX: 'auto' }}>
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
            <div style={{ display: 'flex', gap: 10 }}>
              <span className="badge badge-active" style={{ fontSize: 14 }}>
                Total Apps: {serverPagination.total}
              </span>
              <span className="badge" style={{ fontSize: 14, background: 'var(--primary)', color: 'white' }}>
                Unique Students: {groupedUsers.length}
              </span>
            </div>
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

            

            <select value={filterCity} onChange={(e) => { setFilterCity(e.target.value); setCurrentPage(1); }} style={filterSelectStyle}>
                <option value="" style={{ background: 'var(--bg-card)' }}>All Cities</option>
                {allCities.map(c => <option key={c} value={c} style={{ background: 'var(--bg-card)' }}>{c}</option>)}
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
            <div className="table-scroll-wrap">
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
                      width: '14%',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {groupedUsers.map((group, index) => {
                  const serialNumber = ((currentPage - 1) * serverPagination.limit) + index + 1;
                  const isExpanded = expandedUserIds.has(group.user._id);
                  const apps = group.applications;
                  
                  return (
                    <React.Fragment key={group.user._id}>
                      {/* USER ROW */}
                      <tr style={{ background: isExpanded ? 'var(--bg-card)' : 'transparent', borderBottom: isExpanded ? 'none' : '1px solid var(--border)' }}>
                        <td style={{ ...tableBodyCell, color: 'var(--text-secondary)', fontWeight: 'bold' }}>{serialNumber}</td>
                        <td style={tableBodyCell} colSpan={2}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                            <div className="admin-avatar" style={{ width: 32, height: 32, fontSize: 12 }}>
                              {group.user?.name?.charAt(0) || '?'}
                            </div>
                            <div style={{ minWidth: 0 }}>
                              <div
                                style={{ fontWeight: 'bold', maxWidth: 180, ...oneLineEllipsisStyle }}
                                title={group.user?.name || 'Unknown User'}
                              >
                                {group.user?.name || 'Unknown User'}
                              </div>
                              <div
                                style={{ fontSize: 11, color: 'var(--text-secondary)', maxWidth: 180, ...oneLineEllipsisStyle }}
                                title={group.user?.email || 'N/A'}
                              >
                                {group.user?.email || 'N/A'}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td style={tableBodyCell} colSpan={2}>
                          <div style={{ fontSize: 13, fontWeight: 'bold', color: 'var(--primary)' }}>
                            {apps.length} Application{apps.length > 1 ? 's' : ''}
                          </div>
                        </td>
                        <td style={tableBodyCell}>
                          <div style={{ fontSize: 13, fontWeight: 'bold', color: 'var(--text-primary)' }}>
                            {group.user?.city || 'Location unknown'}
                          </div>
                        </td>
                        <td style={{ ...tableBodyCell, fontSize: 12, color: 'var(--text-secondary)' }}>
                          {new Date(group.latestDate).toLocaleDateString()}
                        </td>
                        <td style={tableBodyCell}>
                           <button
                             onClick={() => toggleUserExpand(group.user._id)}
                             style={{ padding: '8px 12px', background: isExpanded ? 'var(--bg-body)' : 'var(--primary-light)', color: 'var(--primary)', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold', width: '100%', fontSize: 12 }}
                           >
                             {isExpanded ? 'Hide Apps ▲' : 'View Apps ▼'}
                           </button>
                        </td>
                      </tr>

                      {/* EXPANDED APPLICATIONS ROWS */}
                      {isExpanded && apps.map((app) => {
                         const selectedPrograms = Array.isArray(app.selectedPrograms) ? app.selectedPrograms : [];
                         const visiblePrograms = selectedPrograms.slice(0, 2);
                         const hiddenProgramsCount = Math.max(selectedPrograms.length - visiblePrograms.length, 0);
                         
                         return (
                           <tr key={app._id} style={{ background: 'rgba(0,0,0,0.015)' }}>
                              <td style={tableBodyCell}></td>
                              <td style={tableBodyCell} colSpan={2}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, paddingLeft: 15 }}>
                                  <div style={{ width: 28, height: 28, borderRadius: 6, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: '#334155' }}>
                                    {app.type === 'University' ? 'U' : 'S'}
                                  </div>
                                  <div style={{ minWidth: 0 }}>
                                    <div
                                      style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 13, maxWidth: 230, ...oneLineEllipsisStyle }}
                                      title={app.scholarship?.title || app.university?.name || 'N/A'}
                                    >
                                      {app.scholarship?.title || app.university?.name || 'N/A'}
                                    </div>
                                    <div style={{ fontSize: 10, color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{app.type}</div>
                                  </div>
                                </div>
                              </td>
                              <td style={tableBodyCell} colSpan={2}>
                                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                                  {visiblePrograms.map((p, idx) => (
                                    <span key={idx} style={{ 
                                      fontSize: 10, 
                                      padding: '3px 8px', 
                                      border: '1px solid var(--primary-light)', 
                                      borderRadius: '4px',
                                      color: 'var(--primary)',
                                      fontWeight: 600,
                                      maxWidth: 170,
                                      ...oneLineEllipsisStyle
                                    }}>
                                      {p.programName}
                                    </span>
                                  ))}
                                  {hiddenProgramsCount > 0 && (
                                    <span style={{ fontSize: 10, color: 'var(--text-secondary)', fontWeight: 700 }}>
                                      +{hiddenProgramsCount} more
                                    </span>
                                  )}
                                  {selectedPrograms.length === 0 && (
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
                                    background: 'white', 
                                    border: `1.5px solid ${getStatusColor(app.status)}`,
                                    color: getStatusColor(app.status),
                                    fontSize: 11,
                                    fontWeight: 800,
                                    outline: 'none',
                                    cursor: 'pointer'
                                  }}
                                >
                                  {ALL_STATUSES.map(s => <option key={s} value={s} style={{ color: '#000' }}>{s}</option>)}
                                </select>
                              </td>
                              <td style={{ ...tableBodyCell, fontSize: 12, color: 'var(--text-secondary)' }}>
                                {new Date(app.appliedAt).toLocaleDateString()}
                              </td>
                              <td style={tableBodyCell}>
                                <div style={{ display: 'grid', gap: 6, gridTemplateColumns: 'repeat(2, minmax(62px, 1fr))', justifyContent: 'center' }}>
                                  <button
                                    className="btn-icon"
                                    title="View/Edit Profile"
                                    onClick={() => openStudentModal(app)}
                                    style={{ ...compactActionButtonStyle, background: '#4F46E5', color: 'white', fontSize: 10 }}
                                  >
                                    VIEW
                                  </button>
                                  <button
                                    className="btn-icon"
                                    title={`Manage Application${app.admitCard || app.offerLetter ? ' (Docs Uploaded)' : ''}`}
                                    onClick={() => openManageModal(app)}
                                    style={{
                                      ...compactActionButtonStyle,
                                      background: (app.admitCard && app.offerLetter) ? '#059669' :
                                                (app.admitCard || app.offerLetter) ? '#D97706' : '#10B981',
                                      color: 'white',
                                      fontSize: 10,
                                    }}
                                  >
                                    EDIT
                                  </button>
                                  <button
                                    className="btn-icon"
                                    title="Download Education Documents (ZIP)"
                                    onClick={() => {
                                      const preferredName = `${sanitizeFileNamePart(app.user?.name || 'applicant')}-education-documents.zip`;
                                      API.get(`/applications/${app._id}/download-bundle`, {
                                        params: { downloadName: preferredName },
                                        responseType: 'blob',
                                      }).then(res => triggerBlobDownload(res.data, preferredName))
                                        .catch(() => alert('Download failed'));
                                    }}
                                    style={{ ...compactActionButtonStyle, background: '#0F766E', color: 'white', fontSize: 10 }}
                                  >
                                    ZIP
                                  </button>
                                  <button
                                    className="btn-icon"
                                    title="Delete Application"
                                    onClick={() => deleteApplication(app._id)}
                                    style={{ ...compactActionButtonStyle, background: '#fee2e2', color: '#ef4444', fontSize: 10 }}
                                  >
                                    DEL
                                  </button>
                                </div>
                              </td>
                           </tr>
                         );
                      })}
                    </React.Fragment>
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
                <div className="admin-avatar" style={{ width: 45, height: 45 }}>{studentData?.name?.charAt(0)}</div>
                <div>
                  <h3 style={{ margin: 0 }}>Student Profile</h3>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>{studentData?.email}</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <button 
                  onClick={saveStudentProfile} 
                  disabled={isSavingStudent}
                  style={{
                    padding: '8px 20px',
                    background: 'var(--primary)',
                    color: 'white',
                    border: 'none',
                    borderRadius: 8,
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontSize: 12,
                    opacity: isSavingStudent ? 0.7 : 1
                  }}
                >
                  {isSavingStudent ? 'Saving...' : 'Save Profile Changes'}
                </button>
                <button className="btn-close" onClick={() => setShowStudentModal(false)}>✕</button>
              </div>
            </div>
            
            <div className="modal-tabs" style={{ display: 'flex', borderBottom: '1px solid var(--border)', padding: '0 20px', gap: 30, overflowX: 'auto' }}>
              {[
                { id: 'account', label: 'Personal Profile' }, 
                { id: 'education', label: 'Education Docs' }
              ].map(tab => {
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
                      cursor: 'pointer',
                      whiteSpace: 'nowrap'
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
              ) : activeTab === 'account' ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 20 }}>
                  <div className="form-group">
                    <label>Full Name</label>
                    <input type="text" value={studentData?.name || ''} onChange={e => setStudentData({...studentData, name: e.target.value})} />
                  </div>
                  <div className="form-group">
                    <label>Email Address</label>
                    <input type="email" value={studentData?.email || ''} onChange={e => setStudentData({...studentData, email: e.target.value})} />
                  </div>
                  <div className="form-group">
                    <label>Phone Number</label>
                    <input type="text" value={studentData?.phone || ''} onChange={e => setStudentData({...studentData, phone: e.target.value})} />
                  </div>
                  <div className="form-group">
                    <label>New Password (Leave blank to keep current)</label>
                    <input 
                      type="password" 
                      placeholder="••••••••" 
                      value={studentData?.password || ''} 
                      onChange={e => setStudentData({...studentData, password: e.target.value})} 
                    />
                  </div>
                  
                  {/* Geographic Details & Address */}
                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label>Home Address</label>
                    <input 
                      type="text" 
                      placeholder="Street address, house number, etc."
                      value={studentData?.address || ''} 
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
                      value={studentData?.state || ''} 
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
                      value={studentData?.city || ''} 
                      onChange={e => setStudentData({...studentData, city: e.target.value})}
                      disabled={!studentData?.state}
                    >
                      <option value="">Select City</option>
                      {studentData?.state && getCities(ADMIN_COUNTRY, studentData?.state).map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div style={{ gridColumn: '1 / -1', marginTop: 10 }}>
                    <button className="btn-publish" onClick={saveStudentProfile} style={{ padding: '10px 24px', borderRadius: 10, background: 'var(--primary)', color: 'white', border: 'none', fontWeight: 700, cursor: 'pointer' }}>Save Account Changes</button>
                  </div>
                </div>
              ) : activeTab === 'education' ? (
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

                  {renderEducationSection('National ID / Identity', 'nationalId', [
                    { key: 'file', label: 'ID Card PDF' },
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

                  {renderEducationSection('Masters Degree', 'masters', [
                    { key: 'transcript', label: 'Transcript' },
                    { key: 'certificate', label: 'Certificate' }
                  ])}

                  {/* International docs only if relevant data exists */}
                  {(studentData?.education?.international?.passportNumber || studentData?.education?.international?.englishTestType) &&
                    renderEducationSection('International Documents', 'international', [
                      { key: 'passportPdf', label: 'Passport PDF', required: false },
                      { key: 'testTranscript', label: 'English Test Result', required: false },
                      { key: 'cv', label: 'Curriculum Vitae (CV)', required: false },
                      { key: 'recommendationLetter', label: 'Recommendation Letter', required: false }
                    ])
                  }
                </div>
              ) : null}
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
                      const uniId = normalizeId(uni._id || uni);
                      const offeredData = selectedApp.offeredUniversities?.find(
                        (u) =>
                          normalizeId(u?.university?._id || u?.university) === uniId
                      );
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
                                <div style={{ display: 'grid', gap: 8 }}>
                                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                    <button
                                      className={`btn-icon small ${offeredData.admitCard ? 'success' : ''}`}
                                      onClick={() => handleFileUpload(selectedApp._id, 'admitCard', uniId)}
                                      title="Upload Admit Card"
                                    >
                                      🪪 {offeredData.admitCard ? '✓' : ''}
                                    </button>
                                    {offeredData.admitCard && (
                                      <>
                                        <span
                                          style={{
                                            padding: '6px 10px',
                                            borderRadius: 8,
                                            border: '1px solid #e2e8f0',
                                            background: '#f8fafc',
                                            fontSize: 11,
                                            fontWeight: 600,
                                            color: '#475569',
                                            maxWidth: 220,
                                            ...oneLineEllipsisStyle,
                                          }}
                                          title={getStoredFileName(offeredData.admitCard)}
                                        >
                                          {getStoredFileName(offeredData.admitCard)}
                                        </span>
                                         <button
                                           onClick={() => handleDownloadAppDoc(selectedApp._id, 'admitCard', offeredData.admitCard, uniId)}
                                           style={{ padding: '6px 10px', background: 'white', border: '1px solid #cbd5e1', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 11 }}
                                         >
                                           View
                                         </button>
                                        <button
                                          onClick={() => handleDeleteUniDoc(selectedApp._id, uniId, 'admitCard')}
                                          style={{ padding: '6px 10px', background: '#fff1f2', border: '1px solid #fecaca', borderRadius: 8, cursor: 'pointer' }}
                                        >
                                          Delete
                                        </button>
                                      </>
                                    )}
                                  </div>
                                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                    <button
                                      className={`btn-icon small ${offeredData.offerLetter ? 'success' : ''}`}
                                      onClick={() => handleFileUpload(selectedApp._id, 'offerLetter', uniId)}
                                      title="Upload Offer Letter"
                                    >
                                      ✉️ {offeredData.offerLetter ? '✓' : ''}
                                    </button>
                                    {offeredData.offerLetter && (
                                      <>
                                        <span
                                          style={{
                                            padding: '6px 10px',
                                            borderRadius: 8,
                                            border: '1px solid #e2e8f0',
                                            background: '#f8fafc',
                                            fontSize: 11,
                                            fontWeight: 600,
                                            color: '#475569',
                                            maxWidth: 220,
                                            ...oneLineEllipsisStyle,
                                          }}
                                          title={getStoredFileName(offeredData.offerLetter)}
                                        >
                                          {getStoredFileName(offeredData.offerLetter)}
                                        </span>
                                        <button
                                          onClick={() => handleDownloadAppDoc(selectedApp._id, 'offerLetter', offeredData.offerLetter, uniId)}
                                          style={{ padding: '6px 10px', background: 'white', border: '1px solid #cbd5e1', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 11 }}
                                        >
                                          View
                                        </button>
                                        <button
                                          onClick={() => handleDeleteUniDoc(selectedApp._id, uniId, 'offerLetter')}
                                          style={{ padding: '6px 10px', background: '#fff1f2', border: '1px solid #fecaca', borderRadius: 8, cursor: 'pointer' }}
                                        >
                                          Delete
                                        </button>
                                      </>
                                    )}
                                  </div>
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
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16, marginTop: 12 }}>
                <h4 style={{ marginBottom: 12 }}>General Admission Documents</h4>
                <div style={{ display: 'grid', gap: 12 }}>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <button
                      className={`btn-publish ${selectedApp.admitCard ? 'success' : ''}`}
                      onClick={() => handleFileUpload(selectedApp._id, 'admitCard')}
                    >
                      {selectedApp.admitCard ? 'Change Admit Card' : 'Upload Admit Card'}
                    </button>
                    {selectedApp.admitCard && (
                      <>
                        <span
                          style={{
                            padding: '8px 10px',
                            borderRadius: 8,
                            border: '1px solid #e2e8f0',
                            background: '#f8fafc',
                            fontSize: 11,
                            fontWeight: 600,
                            color: '#475569',
                            maxWidth: 240,
                            ...oneLineEllipsisStyle,
                          }}
                          title={getStoredFileName(selectedApp.admitCard)}
                        >
                          {getStoredFileName(selectedApp.admitCard)}
                        </span>
                        <button
                           onClick={() => handleDownloadAppDoc(selectedApp._id, 'admitCard', selectedApp.admitCard)}
                           style={{ padding: '8px 10px', background: 'white', border: '1px solid #cbd5e1', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 11 }}
                         >
                           View
                         </button>
                        <button
                          onClick={() => handleDeleteAppDoc(selectedApp._id, 'admitCard')}
                          style={{ padding: '8px 10px', background: '#fff1f2', border: '1px solid #fecaca', borderRadius: 8, cursor: 'pointer' }}
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <button
                      className={`btn-publish ${selectedApp.offerLetter ? 'success' : ''}`}
                      onClick={() => handleFileUpload(selectedApp._id, 'offerLetter')}
                    >
                      {selectedApp.offerLetter ? 'Change Offer Letter' : 'Upload Offer Letter'}
                    </button>
                    {selectedApp.offerLetter && (
                      <>
                        <span
                          style={{
                            padding: '8px 10px',
                            borderRadius: 8,
                            border: '1px solid #e2e8f0',
                            background: '#f8fafc',
                            fontSize: 11,
                            fontWeight: 600,
                            color: '#475569',
                            maxWidth: 240,
                            ...oneLineEllipsisStyle,
                          }}
                          title={getStoredFileName(selectedApp.offerLetter)}
                        >
                          {getStoredFileName(selectedApp.offerLetter)}
                        </span>
                        <a
                          href={getFileUrl(selectedApp.offerLetter)}
                          target="_blank"
                          rel="noreferrer"
                          style={{ padding: '8px 10px', background: 'white', border: '1px solid #cbd5e1', borderRadius: 8, textDecoration: 'none' }}
                        >
                          View
                        </a>
                        <button
                          onClick={() => handleDeleteAppDoc(selectedApp._id, 'offerLetter')}
                          style={{ padding: '8px 10px', background: '#fff1f2', border: '1px solid #fecaca', borderRadius: 8, cursor: 'pointer' }}
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
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
