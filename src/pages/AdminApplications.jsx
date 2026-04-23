import { useEffect, useState, useMemo, useCallback } from 'react';
import API, { resolveAssetUrl } from '../api';
import imageCompression from 'browser-image-compression';
import { getStates, getCities } from '../data/locations';

const ALL_STATUSES = ['Applied', 'Admit Card', 'Test', 'Interview', 'Selected', 'Rejected'];
const ADMIN_COUNTRY = 'Pakistan';

const extractEmbeddedUrl = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const matched = raw.match(/https?:\/\/[^\s"<>]+/i);
  if (!matched?.[0]) return '';
  return matched[0].replace(/[\],);.]+$/g, '');
};

const NULLISH_FILE_VALUES = new Set([
  'null',
  'undefined',
  'n/a',
  'na',
  'none',
  '-',
]);

const normalizeFileValue = (value) => {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (NULLISH_FILE_VALUES.has(raw.toLowerCase())) return '';
  return raw;
};

const hasFileValue = (value) => Boolean(normalizeFileValue(value));

const getFileUrl = (fileName) => {
  const raw = normalizeFileValue(fileName);
  if (!raw) return '';
  const embedded = extractEmbeddedUrl(raw);
  const sourceUrl = embedded || resolveAssetUrl(raw);

  try {
    const parsed = new URL(sourceUrl);
    const isCloudinary = /cloudinary\.com$/i.test(parsed.hostname);
    const isDocument = /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|txt|csv)$/i.test(
      parsed.pathname || ''
    );
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

const buildDirectDownloadCandidates = (sourceFile) => {
  const candidates = [];
  const seen = new Set();
  const addCandidate = (value) => {
    const normalized = String(value || '').trim();
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    candidates.push(normalized);
  };

  addCandidate(extractEmbeddedUrl(sourceFile));
  addCandidate(getFileUrl(sourceFile));

  for (const current of [...candidates]) {
    try {
      const parsed = new URL(current);
      const isCloudinary = /cloudinary\.com$/i.test(parsed.hostname);
      const isDocument = /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|txt|csv)$/i.test(
        parsed.pathname || ''
      );
      if (
        isCloudinary &&
        isDocument &&
        (parsed.pathname || '').includes('/image/upload/')
      ) {
        addCandidate(current.replace('/image/upload/', '/raw/upload/'));
      }
    } catch {
      // ignore parse errors for malformed candidates
    }
  }

  return candidates.filter((url) => /^https?:\/\//i.test(url));
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
  const raw = String(value || '').trim();
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

const detectBlobFileExtension = async (blob, fallback = '.pdf') => {
  if (!(blob instanceof Blob)) return fallback;

  try {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (
      bytes.length >= 4 &&
      bytes[0] === 0x25 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x44 &&
      bytes[3] === 0x46
    ) {
      return '.pdf';
    }

    if (
      bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    ) {
      return '.png';
    }

    if (
      bytes.length >= 3 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff
    ) {
      return '.jpg';
    }

    if (bytes.length >= 6) {
      const head = String.fromCharCode(...bytes.slice(0, 6)).toUpperCase();
      if (head === 'GIF87A' || head === 'GIF89A') return '.gif';
    }

    if (bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b) {
      return '.zip';
    }
  } catch {
    return fallback;
  }

  return fallback;
};

const replaceFileExtension = (fileName, extension) => {
  const safeName = String(fileName || '').trim();
  const safeExt = extension.startsWith('.') ? extension : `.${extension}`;
  if (!safeName) return `document${safeExt}`;
  const base = safeName.replace(/\.[^.\\/]+$/, '');
  return `${base}${safeExt}`;
};

const triggerBlobDownload = (blobData, downloadName) => {
  const blobUrl = window.URL.createObjectURL(new Blob([blobData]));
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = downloadName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(blobUrl);
};

const downloadFromDirectUrl = async (url, downloadName) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('File does not exist on server');
  }
  const blob = await response.blob();
  const finalName = replaceFileExtension(
    downloadName,
    await detectBlobFileExtension(blob, inferFileExtension(downloadName, '.pdf'))
  );
  triggerBlobDownload(blob, finalName);
};

const parseDownloadError = async (err, fallback = 'Failed to download document') => {
  const directMessage = err?.response?.data?.message;
  if (typeof directMessage === 'string' && directMessage.trim()) {
    return directMessage.trim();
  }

  const blob = err?.response?.data;
  if (blob instanceof Blob) {
    try {
      const text = (await blob.text()).trim();
      if (!text) return fallback;
      try {
        const parsed = JSON.parse(text);
        if (parsed?.message) return String(parsed.message);
      } catch {
        // ignore json parse errors
      }
      return text.slice(0, 180);
    } catch {
      return fallback;
    }
  }

  return err?.message || fallback;
};

const parseApiErrorMessage = (err, fallback = 'Request failed') => {
  const direct = err?.response?.data?.message;
  if (typeof direct === 'string' && direct.trim()) return direct.trim();
  const nested = err?.response?.data?.error;
  if (typeof nested === 'string' && nested.trim()) return nested.trim();
  const generic = err?.message;
  if (typeof generic === 'string' && generic.trim()) return generic.trim();
  return fallback;
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

export default function AdminApplications() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [filterState, setFilterState] = useState('');
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
  const [studentData, setStudentData] = useState(null);
  const [activeTab, setActiveTab] = useState('account');
  const [currentAppForModal, setCurrentAppForModal] = useState(null);
  const [studentLoading, setStudentLoading] = useState(false);
  const [showDocModal, setShowDocModal] = useState(false);
  const [docApp, setDocApp] = useState(null);

  const getFileDisplayName = useCallback((value) => {
    const raw = normalizeFileValue(value);
    if (!raw) return 'Not uploaded';
    const embedded = extractEmbeddedUrl(raw);
    const source = (embedded || raw).split('?')[0].split('#')[0];
    const parts = source.split(/[\\/]/).filter(Boolean);
    const last = parts[parts.length - 1] || source;
    try {
      return decodeURIComponent(last);
    } catch {
      return last;
    }
  }, []);

  const syncApplicationRecord = useCallback((updated) => {
    if (!updated?._id) return;
    setData((prev) => prev.map((a) => (a._id === updated._id ? updated : a)));
    setSelectedApp((prev) => (prev?._id === updated._id ? updated : prev));
    setCurrentAppForModal((prev) =>
      prev?._id === updated._id ? updated : prev
    );
    setDocApp((prev) => (prev?._id === updated._id ? updated : prev));
  }, []);

  const openDocsModal = useCallback((app) => {
    if (!app?._id) return;
    setDocApp(app);
    setShowDocModal(true);
  }, []);

  const closeDocsModal = useCallback(() => {
    setShowDocModal(false);
    setDocApp(null);
  }, []);

  const handleDownloadApplicationBundle = useCallback(
    async (application) => {
      const target = application || docApp;
      if (!target?._id) return;
      try {
        const userName = target?.user?.name || 'applicant';
        const preferredName = `${sanitizeFileNamePart(userName, 'applicant')}-${sanitizeFileNamePart(target._id, 'application')}-bundle.zip`;
        const res = await API.get(`/applications/${target._id}/download-bundle`, {
          params: { downloadName: preferredName },
          responseType: 'blob',
        });
        triggerBlobDownload(res.data, preferredName);
      } catch (err) {
        console.error('Bundle download failed:', err);
        alert('Failed to download ZIP bundle');
      }
    },
    [docApp]
  );

  const fetchApplicants = useCallback(async () => {
    setLoading(true);
    try {
      const res = await API.get('/applications/admin/list', {
        params: {
          page: currentPage,
          limit: serverPagination.limit,
          search: searchTerm || undefined,
          status: statusFilter || undefined,
          state: filterState || undefined,
          city: filterCity || undefined,
          level: levelFilter || undefined,
          includeEligible: false,
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
    filterState,
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
    const timer = setTimeout(() => {
      const normalized = searchInput.trim();
      setSearchTerm((prev) => (prev === normalized ? prev : normalized));
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, filterState, filterCity, levelFilter, startDate, endDate]);

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
      if (docApp?._id === appId) setDocApp(prev => ({ ...prev, status: newStatus }));
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
          syncApplicationRecord(res.data.data);
        } else {
          const res = await API.put(`/applications/${appId}`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
          });
          syncApplicationRecord(res.data.data);
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
      if (selectedApp?._id === appId) {
        setSelectedApp(null);
        setShowModal(false);
      }
      if (currentAppForModal?._id === appId) {
        setCurrentAppForModal(null);
      }
      if (docApp?._id === appId) {
        closeDocsModal();
      }
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

  const handleDeleteAppDoc = async (appId, field) => {
    if (!window.confirm(`Delete ${field === 'admitCard' ? 'Admit Card' : 'Offer Letter'}?`)) return;
    try {
      const payload = {};
      payload[field] = null;
      const res = await API.put(`/applications/${appId}`, payload);
      syncApplicationRecord(res.data.data);
      alert('Document deleted');
    } catch (err) {
      alert(parseApiErrorMessage(err, 'Delete failed'));
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
      } catch (err) {
        alert(parseApiErrorMessage(err, 'Upload failed'));
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
    } catch (err) {
      alert(parseApiErrorMessage(err, 'Delete failed'));
    }
  };

  const buildApplicationDocDownloadName = ({
    field,
    sourceFile,
    universityName = '',
  }) => {
    const userName =
      studentData?.name ||
      currentAppForModal?.user?.name ||
      selectedApp?.user?.name ||
      'applicant';
    const docLabel = field === 'admitCard' ? 'admit-card' : 'offer-letter';
    const ext = inferFileExtension(sourceFile, '.pdf');
    const parts = [
      sanitizeFileNamePart(userName, 'applicant'),
      sanitizeFileNamePart(universityName, ''),
      docLabel,
    ].filter(Boolean);
    return `${parts.join('-') || 'document'}${ext}`;
  };

  const downloadApplicationDoc = async ({
    appId,
    field,
    sourceFile,
    universityId = '',
    universityName = '',
  }) => {
    try {
      const preferredName = buildApplicationDocDownloadName({
        appId,
        field,
        sourceFile,
        universityName,
      });
      const response = await API.get(`/applications/${appId}/download-doc/${field}`, {
        params: {
          uniId: universityId || undefined,
          downloadName: preferredName,
        },
        responseType: 'blob',
      });
      const finalName = replaceFileExtension(
        preferredName,
        await detectBlobFileExtension(
          response.data,
          inferFileExtension(sourceFile, inferFileExtension(preferredName, '.pdf'))
        )
      );
      triggerBlobDownload(response.data, finalName);
    } catch (err) {
      console.error('Application document download failed:', err);
      const message = await parseDownloadError(err);
      const lower = String(message || '').toLowerCase();
      const shouldTryDirect =
        lower.includes('document not found') ||
        lower.includes('file does not exist on server') ||
        lower.includes('not available');
      if (shouldTryDirect) {
        const candidates = buildDirectDownloadCandidates(sourceFile);
        for (const candidate of candidates) {
          try {
            await downloadFromDirectUrl(candidate, preferredName);
            return;
          } catch (directErr) {
            console.error('Direct download fallback failed:', directErr);
          }
        }
      }
      alert(message);
    }
  };

  const downloadEducationDoc = async (section, field, sourceFile, preferredName) => {
    try {
      const fallbackExt = inferFileExtension(sourceFile, '.pdf');
      const safeName = String(preferredName || '').trim()
        ? preferredName
        : `${sanitizeFileNamePart(studentData?.name || 'applicant', 'applicant')}-${section}-${field}${fallbackExt}`;
      const response = await API.get(
        `/users/${studentData._id}/education/${section}/${field}/download`,
        {
          params: { downloadName: safeName },
          responseType: 'blob',
        }
      );
      const finalName = replaceFileExtension(
        safeName,
        await detectBlobFileExtension(response.data, fallbackExt)
      );
      triggerBlobDownload(response.data, finalName);
    } catch (err) {
      console.error('Education download failed:', err);
      alert('Failed to download document');
    }
  };

  const handleDeleteUniDoc = async (appId, uniId, field) => {
    if (!window.confirm(`Delete ${field === 'admitCard' ? 'Admit Card' : 'Offer Letter'} for this university?`)) {
      return;
    }

    try {
      const payload = { universityId: uniId, [field]: null };
      const res = await API.put(`/applications/${appId}/university-status`, payload);
      syncApplicationRecord(res.data.data);
    } catch (err) {
      console.error('Offered university doc delete failed:', err);
      alert(parseApiErrorMessage(err, 'Failed to delete university document'));
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
      syncApplicationRecord(res.data.data);
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
      syncApplicationRecord(res.data.data);
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
            const fileName = normalizeFileValue(
              f.isPersonalInfo ? personalInfo?.[f.key] : eduData[f.key]
            );
            const hasFile = hasFileValue(fileName);
            const displayLabel = `${studentData?.name}_${title}_${f.label}`.replace(/\s+/g, '_');
            return (
              <div key={f.key} className="doc-tile" style={{ background: 'var(--bg-card)', padding: 15, borderRadius: 12, border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{f.label}</span>
                  <span className={`badge ${hasFile ? 'badge-active' : ''}`} style={{ fontSize: 10 }}>
                    {hasFile ? 'Uploaded' : 'Pending'}
                  </span>
                </div>
                {hasFile && (
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 12, wordBreak: 'break-all', opacity: 1, fontWeight: 500 }}>
                    File: {fileName.split('/').pop()}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {hasFile ? (
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
                            fileName,
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
    <div className="applicants-page" style={{ padding: '0', width: '100%', maxWidth: 'none' }}>
      <div className="table-card" style={{ border: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', background: 'transparent', width: '100%', margin: 0 }}>
        <div
          className="table-header"
          style={{
            flexDirection: 'column',
            alignItems: 'flex-start',
            gap: '16px',
            padding: '24px',
            background: '#ffffff',
            borderRadius: '20px 20px 0 0',
            borderBottom: '1px solid var(--border)',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 15 }}>
            <div>
              <h2>👥 All Applications</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
                  Managing all applications for your posts.
                </p>
                <div style={{ display: 'flex', gap: 8, fontSize: 11 }}>
                  <span style={{ background: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: '5px', fontWeight: 700 }}>
                    Selected: {data.filter(a => a.status === 'Selected').length}
                  </span>
                  <span style={{ background: '#fee2e2', color: '#991b1b', padding: '2px 8px', borderRadius: '5px', fontWeight: 700 }}>
                    Rejected: {data.filter(a => a.status === 'Rejected').length}
                  </span>
                  <span style={{ background: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: '5px', fontWeight: 700 }}>
                    Applied: {data.filter(a => a.status === 'Applied').length}
                  </span>
                </div>
              </div>
            </div>
          </div>
          <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
            Total Results: {serverPagination.total}
          </span>

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
                    placeholder="Search name, email, or university/scholarship..." 
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
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
          <div className="empty-msg">No applications found matching your criteria.</div>
        ) : (
          <>
            <div style={{ width: '100%', overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'separate', borderSpacing: '0' }}>
              <thead>
                <tr>
                  <th style={{ padding: '10px 12px', width: '84px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input
                        type="checkbox"
                        onChange={handleSelectAll}
                        checked={currentItems.length > 0 && selectedIds.length === currentItems.length}
                        style={{ cursor: 'pointer', width: '16px', height: '16px', accentColor: '#4f46e5' }}
                      />
                      <span>#</span>
                    </div>
                  </th>
                  <th style={{ padding: '10px 12px', minWidth: '170px' }}>Student Info</th>
                  <th style={{ padding: '10px 12px', minWidth: '150px' }}>Location</th>
                  <th style={{ padding: '10px 12px', minWidth: '220px' }}>Applied Info</th>
                  <th style={{ padding: '10px 12px', minWidth: '220px' }}>Programs / Level</th>
                  <th style={{ padding: '10px 12px', minWidth: '130px' }}>Docs</th>
                  <th style={{ padding: '10px 12px', minWidth: '110px' }}>Applied On</th>
                  <th style={{ textAlign: 'center', padding: '10px 12px', minWidth: '130px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {currentItems.map((app, index) => {
                  const serialNumber = ((currentPage - 1) * serverPagination.limit) + index + 1;
                  return (
                    <tr key={app._id} style={{ background: selectedIds.includes(app._id) ? '#f8fafc' : 'transparent', transition: 'background 0.2s' }}>
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(app._id)}
                            onChange={() => handleSelectOne(app._id)}
                            style={{ cursor: 'pointer', width: '16px', height: '16px', accentColor: '#4f46e5' }}
                          />
                          <span style={{ color: 'var(--text-secondary)', fontWeight: 800, fontSize: '13px' }}>{serialNumber}</span>
                        </div>
                      </td>

                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ wordBreak: 'break-word', maxWidth: '220px' }}>
                          <div style={{ fontWeight: 'bold', fontSize: '12px', color: '#000000', lineHeight: '1.2' }}>
                            {app.user?.name || 'Unknown User'}
                          </div>
                          <div style={{ fontSize: '10px', color: '#4b5563', marginTop: '2px' }}>
                            {app.user?.email || 'N/A'}
                          </div>
                        </div>
                      </td>

                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ fontSize: 11, color: '#000000' }}>{app.user?.state || 'N/A'}</div>
                        <div style={{ fontSize: 11, color: '#000000' }}>{app.user?.city || 'N/A'}</div>
                        {app.user?.address && (
                          <div style={{ fontSize: 10, color: '#64748b', marginTop: 2, overflowWrap: 'anywhere' }}>
                            {app.user.address}
                          </div>
                        )}
                      </td>

                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                          {app.type === 'University' && app.university?.thumbnail ? (
                            <img
                              src={resolveAssetUrl(app.university.thumbnail)}
                              alt=""
                              style={{ width: 30, height: 30, borderRadius: 8, objectFit: 'cover', border: '1px solid var(--border)' }}
                            />
                          ) : (
                            <div style={{ width: 30, height: 30, borderRadius: 8, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <span style={{ fontSize: 12 }}>{app.type === 'University' ? 'U' : 'S'}</span>
                            </div>
                          )}
                          <div style={{ wordBreak: 'break-word', minWidth: 0 }}>
                            <div style={{ fontWeight: 700, fontSize: '11px', color: '#374151' }}>
                              {app.scholarship?.title || app.university?.name || 'N/A'}
                            </div>
                            <div style={{ fontSize: 10, color: '#64748b', marginTop: 2, fontWeight: 700 }}>
                              {app.type || 'Application'}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ wordBreak: 'break-word', minWidth: '180px' }}>
                          <div style={{ display: 'flex', gap: '6px', marginTop: '2px', flexWrap: 'wrap' }}>
                            {app.selectedPrograms?.length ? app.selectedPrograms.map((p, idx) => (
                              <span key={idx} style={{
                                fontSize: 10,
                                padding: '0',
                                background: 'none',
                                border: 'none',
                                color: 'var(--primary)',
                                fontWeight: 600,
                                whiteSpace: 'normal',
                                overflowWrap: 'anywhere'
                              }}>
                                {idx > 0 ? ', ' : ''}{p.programName}
                              </span>
                            )) : (
                              <span style={{ fontSize: 11, color: '#94a3b8' }}>No program selected</span>
                            )}
                          </div>
                        </div>
                      </td>

                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ display: 'grid', gap: 6 }}>
                          <button
                            onClick={() => openDocsModal(app)}
                            style={{
                              background: '#0F766E',
                              border: 'none',
                              color: 'white',
                              fontSize: '11px',
                              padding: '6px 10px',
                              borderRadius: '6px',
                              fontWeight: 700,
                              cursor: 'pointer',
                              width: '100%'
                            }}
                            title="Application documents"
                          >
                            DOCS
                          </button>
                          {app.scholarship && (
                            <button
                              onClick={() => openManageModal(app)}
                              style={{
                                background: '#334155',
                                border: 'none',
                                color: 'white',
                                fontSize: '10px',
                                padding: '5px 8px',
                                borderRadius: '6px',
                                fontWeight: 700,
                                cursor: 'pointer',
                                width: '100%'
                              }}
                              title="Scholarship university-wise docs/status"
                            >
                              MANAGE
                            </button>
                          )}
                        </div>
                      </td>

                      <td style={{ fontSize: 11, color: '#000000', padding: '10px 12px', fontWeight: 500 }}>
                        {new Date(app.appliedAt).toLocaleDateString()}
                      </td>

                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
                          <button
                            onClick={() => openStudentModal(app)}
                            style={{
                              background: '#4F46E5',
                              border: 'none',
                              color: 'white',
                              fontSize: '11px',
                              padding: '4px 10px',
                              borderRadius: '6px',
                              fontWeight: 600,
                              cursor: 'pointer'
                            }}
                          >
                            VIEW
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
	              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
	                <button
	                  className="btn-action"
	                  onClick={() => handleDownloadApplicationBundle(currentAppForModal)}
	                  style={{ whiteSpace: 'nowrap' }}
	                  title="Download full applicant bundle"
	                >
	                  Download Full Bundle (ZIP)
	                </button>
	                <button className="btn-close" onClick={() => setShowStudentModal(false)}>✕</button>
	              </div>
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

                   {/* Higher-education sections */}

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

                  <div style={{ marginTop: 25, padding: '15px 20px', borderTop: '1px solid var(--border)', textAlign: 'right' }}>
                    <button className="btn-publish" onClick={handleStudentUpdate}>✅ Save All Education Changes</button>
                  </div>
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
                      const uniId = normalizeId(uni._id || uni);
                      const offeredData = selectedApp.offeredUniversities?.find(
                        (u) =>
                          normalizeId(u?.university?._id || u?.university) === uniId
                      );
                      const isOffered = !!offeredData;
                      const hasAdmitCard = hasFileValue(offeredData?.admitCard);
                      const hasOfferLetter = hasFileValue(offeredData?.offerLetter);

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
                                {uni.thumbnail && <img src={resolveAssetUrl(uni.thumbnail)} alt="" style={{ width: 30, height: 30, borderRadius: '50%' }} />}
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
                                      className={`btn-icon small ${hasAdmitCard ? 'success' : ''}`}
                                      onClick={() => handleFileUpload(selectedApp._id, 'admitCard', uniId)}
                                      title="Upload Admit Card"
                                    >
                                      🪪 {hasAdmitCard ? '✓' : ''}
                                    </button>
                                    {hasAdmitCard && (
                                      <>
                                        <a
                                          href={getFileUrl(offeredData.admitCard)}
                                          target="_blank"
                                          rel="noreferrer"
                                          style={{ padding: '6px 10px', background: 'white', border: '1px solid #cbd5e1', borderRadius: 8, textDecoration: 'none' }}
                                        >
                                          View
                                        </a>
                                        <button
                                          onClick={() =>
                                            downloadApplicationDoc({
                                              appId: selectedApp._id,
                                              field: 'admitCard',
                                              sourceFile: offeredData.admitCard,
                                              universityId: uniId,
                                              universityName: uni.name || 'university',
                                            })
                                          }
                                          style={{ padding: '6px 10px', background: '#e0f2fe', border: '1px solid #bae6fd', borderRadius: 8, cursor: 'pointer' }}
                                        >
                                          Download
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
                                      className={`btn-icon small ${hasOfferLetter ? 'success' : ''}`}
                                      onClick={() => handleFileUpload(selectedApp._id, 'offerLetter', uniId)}
                                      title="Upload Offer Letter"
                                    >
                                      ✉️ {hasOfferLetter ? '✓' : ''}
                                    </button>
                                    {hasOfferLetter && (
                                      <>
                                        <a
                                          href={getFileUrl(offeredData.offerLetter)}
                                          target="_blank"
                                          rel="noreferrer"
                                          style={{ padding: '6px 10px', background: 'white', border: '1px solid #cbd5e1', borderRadius: 8, textDecoration: 'none' }}
                                        >
                                          View
                                        </a>
                                        <button
                                          onClick={() =>
                                            downloadApplicationDoc({
                                              appId: selectedApp._id,
                                              field: 'offerLetter',
                                              sourceFile: offeredData.offerLetter,
                                              universityId: uniId,
                                              universityName: uni.name || 'university',
                                            })
                                          }
                                          style={{ padding: '6px 10px', background: '#e0f2fe', border: '1px solid #bae6fd', borderRadius: 8, cursor: 'pointer' }}
                                        >
                                          Download
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
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 12 }}>
                <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)' }}>
                  General admit/offer files are now managed from the table <strong>DOCS</strong> button.
                </p>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-publish" onClick={() => setShowModal(false)} style={{ width: '100%' }}>Done</button>
            </div>
          </div>
        </div>
      )}

      {showDocModal && docApp && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '760px', width: '92%', overflow: 'hidden' }}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ minWidth: 0 }}>
                <h3 style={{ margin: 0 }}>Application Documents</h3>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-secondary)', overflowWrap: 'anywhere' }}>
                  {docApp.user?.name || 'Applicant'} - {docApp.university?.name || docApp.scholarship?.title || 'Application'}
                </p>
              </div>
              <button className="btn-close" onClick={closeDocsModal}>✕</button>
            </div>

            <div className="modal-body" style={{ display: 'grid', gap: 12 }}>
              <div
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  padding: 12,
                  background: '#fff',
                  display: 'grid',
                  gap: 8,
                }}
              >
                <strong style={{ fontSize: 13 }}>Application Status</strong>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <select
                    value={docApp.status || 'Applied'}
                    onChange={(e) => handleStatusChange(docApp._id, e.target.value)}
                    style={{
                      minWidth: 170,
                      padding: '8px 10px',
                      borderRadius: 8,
                      border: '1px solid var(--border)',
                      background: '#fff',
                      fontSize: 12,
                      fontWeight: 700,
                      color: '#0f172a',
                      cursor: 'pointer',
                    }}
                  >
                    {ALL_STATUSES.map((statusOption) => (
                      <option key={statusOption} value={statusOption}>
                        {statusOption}
                      </option>
                    ))}
                  </select>
                  <span style={{ fontSize: 11, color: '#64748b' }}>
                    Update applicant stage from here.
                  </span>
                </div>
              </div>

              {[
                { field: 'admitCard', title: 'Admit Card' },
                { field: 'offerLetter', title: 'Offer Letter' },
              ].map((doc) => {
                const fileValue = normalizeFileValue(docApp?.[doc.field]);
                const hasFile = hasFileValue(fileValue);
                const displayName = getFileDisplayName(fileValue);
                return (
                  <div
                    key={doc.field}
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: 12,
                      padding: 12,
                      background: '#fff',
                      display: 'grid',
                      gap: 10,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <strong style={{ fontSize: 13 }}>{doc.title}</strong>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: '3px 8px',
                          borderRadius: 999,
                          color: hasFile ? '#166534' : '#92400e',
                          background: hasFile ? '#dcfce7' : '#fef3c7',
                        }}
                      >
                        {hasFile ? 'Uploaded' : 'Missing'}
                      </span>
                    </div>

                    <div style={{ fontSize: 12, color: '#475569', overflowWrap: 'anywhere' }}>
                      {displayName}
                    </div>

                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button
                        className="btn-action-primary"
                        onClick={() => handleFileUpload(docApp._id, doc.field)}
                      >
                        {hasFile ? 'Change' : 'Upload'}
                      </button>
                      {hasFile && (
                        <a
                          href={getFileUrl(fileValue)}
                          target="_blank"
                          rel="noreferrer"
                          className="btn-action"
                          style={{ textDecoration: 'none' }}
                        >
                          View
                        </a>
                      )}
                      {hasFile && (
                        <button
                          className="btn-action"
                          onClick={() =>
                            downloadApplicationDoc({
                              appId: docApp._id,
                              field: doc.field,
                              sourceFile: fileValue,
                            })
                          }
                        >
                          Download
                        </button>
                      )}
                      {hasFile && (
                        <button
                          className="btn-action"
                          style={{ borderColor: '#fecaca', color: '#b91c1c', background: '#fff1f2' }}
                          onClick={() => handleDeleteAppDoc(docApp._id, doc.field)}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap', paddingTop: 4 }}>
                <button className="btn-action" onClick={() => handleDownloadApplicationBundle(docApp)}>
                  Download ZIP
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

