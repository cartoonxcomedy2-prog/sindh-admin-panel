import { useState, useEffect, useMemo, memo, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import API, { resolveAssetUrl } from '../api';
import imageCompression from 'browser-image-compression';
import { getStates, getCities, getCurrency } from '../data/locations';
import { BACHELOR_PROGRAMS, MASTER_PROGRAMS } from '../data/programs';
import '../forms.css';

const COVERAGE_OPTIONS = [
  'Tuition Fee', 'Accommodation', 'Stipend',
  'Books & Supplies', 'Travel Allowance', 'Living Expenses',
  'Health Insurance', 'Research Grants', 'Laptop/Equipment',
];

const DURATIONS = ['1 Year', '2 Years', '3 Years', '4 Years', '5 Years', '6 Years'];
const ALL_STEPS = ['Applied', 'Admit Card', 'Test', 'Interview'];
const SCHOLARSHIP_SECTION_NAV = [
  { id: 'sch-basic', label: 'Basic' },
  { id: 'sch-location', label: 'Location' },
  { id: 'sch-contact', label: 'Contact Info' },
  { id: 'sch-thumbnail', label: 'Thumbnail' },
  { id: 'sch-coverage', label: 'Coverage' },
  { id: 'sch-deadline', label: 'Deadline' },
  { id: 'sch-steps', label: 'Tracking Steps' },
  { id: 'sch-programs-bachelor', label: 'Bachelor Programs' },
  { id: 'sch-programs-master', label: 'Master/PhD Programs' },
  { id: 'sch-eligibility', label: 'Eligibility' },
  { id: 'sch-universities', label: 'Linked Universities' },
];

const emptyProgram = (type) => ({
  name: '',
  type: type || 'Bachelor',
  duration: type === 'Master' ? '2 Years' : '4 Years',
});

const emptyContact = () => ({
  email: '',
  phone: '',
});

const ADMIN_COUNTRY = 'Pakistan';

const normalizeProgramType = (rawType, programName = '') => {
  const type = String(rawType || '').toLowerCase().trim();
  const name = String(programName || '').toLowerCase().trim();

  if (
    type.includes('bachelor') ||
    type === 'bs' ||
    type === 'bsc' ||
    type === 'b.sc' ||
    type.includes('undergrad')
  ) {
    return 'Bachelor';
  }
  if (type.includes('phd') || type.includes('doctor')) return 'PhD';
  if (type.includes('diploma')) return 'Diploma';
  if (type.includes('master') || type === 'ms' || type === 'msc' || type === 'm.sc' || type === 'mphil') {
    return 'Master';
  }
  if (BACHELOR_PROGRAMS.some((p) => p.toLowerCase() === name)) return 'Bachelor';
  return 'Master';
};

const normalizeScholarshipProgram = (program = {}) => {
  const name = program.name || program.programName || '';
  const type = normalizeProgramType(program.type || program.programType || program.level, name);
  return {
    name,
    type,
    duration: program.duration || (type === 'Bachelor' ? '4 Years' : '2 Years'),
  };
};

const tryParseLooseJSON = (value) => {
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/'\s*\+\s*'/g, '').replace(/\\n/g, '\n').trim();
  if (!cleaned || (!cleaned.includes('{') && !cleaned.includes('[')) || !cleaned.includes(':')) {
    return null;
  }
  const fixed = cleaned
    .replace(/(['"])?([a-zA-Z0-9_]+)(['"])?:/g, '"$2":')
    .replace(/'/g, '"');
  try {
    return JSON.parse(fixed);
  } catch {
    return null;
  }
};

const extractProgramFromString = (value) => {
  if (typeof value !== 'string') return null;
  const nameMatch = /name\s*[:=]\s*['"]([^'"]+)['"]/i.exec(value);
  const typeMatch = /type\s*[:=]\s*['"]([^'"]+)['"]/i.exec(value);
  const durationMatch = /duration\s*[:=]\s*['"]([^'"]+)['"]/i.exec(value);
  if (!nameMatch && !typeMatch && !durationMatch) return null;
  return {
    name: nameMatch?.[1] || '',
    type: typeMatch?.[1] || '',
    duration: durationMatch?.[1] || '',
  };
};

const normalizeProgramPayload = (entry, fallbackType) => {
  if (!entry) return null;

  if (typeof entry === 'string') {
    const parsed = tryParseLooseJSON(entry);
    if (Array.isArray(parsed)) return normalizeProgramPayload(parsed[0], fallbackType);
    if (parsed && typeof parsed === 'object') return normalizeProgramPayload(parsed, fallbackType);

    const extracted = extractProgramFromString(entry);
    if (extracted) return normalizeProgramPayload(extracted, fallbackType);

    const name = entry.trim();
    if (!name) return null;
    const type = normalizeProgramType(fallbackType || '', name);
    return {
      name,
      type,
      duration: type === 'Bachelor' ? '4 Years' : '2 Years',
    };
  }

  if (Array.isArray(entry)) {
    return normalizeProgramPayload(entry[0], fallbackType);
  }

  if (typeof entry === 'object') {
    const name = (entry.name || entry.programName || '').toString().trim();
    if (!name) return null;
    const type = normalizeProgramType(
      entry.type || entry.programType || entry.level || fallbackType,
      name,
    );
    return {
      name,
      type,
      duration: entry.duration || (type === 'Bachelor' ? '4 Years' : '2 Years'),
    };
  }

  return null;
};

function Toast({ msg }) {
  return <div className="toast">✅ {msg}</div>;
}

const formatDateToISO = (dateStr) => {
  if (!dateStr || String(dateStr).trim() === '') return '';
  try {
    const d = new Date(dateStr);
    return !isNaN(d.getTime()) ? d.toISOString().split('T')[0] : '';
  } catch { return ''; }
};

const UniversitySelectionItem = memo(({ uni, isSelected, onClick }) => (
  <div 
    className={`uni-selection-card ${isSelected ? 'selected' : ''}`}
    onClick={() => onClick(uni._id)}
  >
    <div className="uni-selection-checkbox">
      {isSelected && <span>✓</span>}
    </div>
    <div className="uni-selection-info">
      <div className="uni-selection-name">{uni.name}</div>
      <div className="uni-selection-loc">{uni.city}, {uni.state}</div>
    </div>
  </div>
));

const ScholarshipProgramItem = memo(({ prog, idx, group, onUpdate, onRemove, programOptions }) => {
  return (
    <div className="program-card">
      <div className="program-card-header">
        <h4>{group} Program #{idx + 1}</h4>
        <button type="button" className="btn-remove" onClick={() => onRemove(group, idx)}>×</button>
      </div>

      <div className="form-row three">
        <div className="form-group">
          <label>Program Name *</label>
          <select
            value={prog.name}
            onChange={(e) => onUpdate(group, idx, 'name', e.target.value)}
          >
            <option value="">Select Program</option>
            {programOptions.map((p) => <option key={p} value={p}>{p}</option>)}
            {prog.name && !programOptions.includes(prog.name) && prog.name !== 'Other' && (
              <option value={prog.name}>{prog.name} (Existing)</option>
            )}
            <option value="Other">Other</option>
          </select>
          {prog.name === 'Other' && (
            <input
              style={{ marginTop: 8 }}
              placeholder="Type program name..."
              onChange={(e) => onUpdate(group, idx, 'name', e.target.value)}
            />
          )}
        </div>
        <div className="form-group">
          <label>Type</label>
          {group === 'Bachelor' ? (
            <div className="read-only-hint" style={{ padding: '12px 16px', borderRadius: '12px', fontSize: '14px' }}>📘 Bachelor</div>
          ) : (
            <select value={prog.type} onChange={(e) => onUpdate(group, idx, 'type', e.target.value)}>
              <option>Master</option>
              <option>PhD</option>
              <option>Diploma</option>
              {prog.type && !['Master', 'PhD', 'Diploma'].includes(prog.type) && (
                <option value={prog.type}>{prog.type} (Existing)</option>
              )}
            </select>
          )}
        </div>
        <div className="form-group">
          <label>Duration</label>
          <select value={prog.duration} onChange={(e) => onUpdate(group, idx, 'duration', e.target.value)}>
            {['1 Year', '2 Years', '3 Years', '4 Years', '5 Years', '6 Years'].map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
});

export default function CreateScholarship() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = !!id;
  const [loading, setLoading] = useState(false);
  const [isBootstrapping, setIsBootstrapping] = useState(false);
  const [toast, setToast] = useState('');

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [state, setState] = useState('');
  const [city, setCity] = useState('');
  const [currency, setCurrency] = useState('');
  const [schType, setSchType] = useState('Public');
  const [coverage, setCoverage] = useState([]);
  const [deadline, setDeadline] = useState('');
  const [minPercentage, setMinPercentage] = useState('');
  const [minGrade, setMinGrade] = useState('');
  const [eligibilityDesc, setEligibilityDesc] = useState('');
  const [contactInfo, setContactInfo] = useState([emptyContact()]);
  const [contact, setContact] = useState('');
  const [testDate, setTestDate] = useState('');
  const [interviewDate, setInterviewDate] = useState('');
  
  const [bachelorPrograms, setBachelorPrograms] = useState([emptyProgram('Bachelor')]);
  const [masterPrograms, setMasterPrograms] = useState([emptyProgram('Master')]);
  
  // Universities
  const [showSelectedOnly, setShowSelectedOnly] = useState(false);
  const [allUniversities, setAllUniversities] = useState([]);
  const [linkedUniversities, setLinkedUniversities] = useState([]);
  const [searchTermUni, setSearchTermUni] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  
  // Optimized filtering logic moved to top level
  const filteredUniversities = useMemo(() => {
    return allUniversities.filter(u => {
      const matchesSearch = u.name.toLowerCase().includes(debouncedSearchTerm.toLowerCase());
      const matchesSelected = showSelectedOnly ? linkedUniversities.includes(u._id) : true;
      return matchesSearch && matchesSelected;
    });
  }, [allUniversities, debouncedSearchTerm, showSelectedOnly, linkedUniversities]);

  useEffect(() => {
    if (!isEdit) {
      const adminInfo = JSON.parse(localStorage.getItem('admin') || sessionStorage.getItem('admin') || '{}');
      if (adminInfo.role === 'scholarship') {
        API.get('/scholarships/admin/list').then(res => {
          const list = res.data.data || [];
          if (list.length > 0) {
            navigate(`/scholarships/edit/${list[0]._id}`, { replace: true });
          }
        }).catch(err => console.error('Redirect check failed:', err));
      }
    }
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTermUni);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTermUni]);

  const [duration, setDuration] = useState('');
  const [amount, setAmount] = useState('');
  const [provider, setProvider] = useState('');
  const [website, setWebsite] = useState('');
  const [address, setAddress] = useState('');
  const [thumbnailPreview, setThumbnailPreview] = useState('');

  // Application Steps (Applied is always on)
  const [selectedSteps, setSelectedSteps] = useState(['Applied']);

  useEffect(() => {
    if (!isEdit) {
      const adminInfo = JSON.parse(localStorage.getItem('admin') || sessionStorage.getItem('admin') || '{}');
      if (adminInfo.role === 'scholarship') {
        API.get('/scholarships/admin/list').then(res => {
          const list = res.data.data || [];
          if (list.length > 0) {
            navigate(`/scholarships/edit/${list[0]._id}`, { replace: true });
          }
        }).catch(err => console.error('Redirect check failed:', err));
      }
    }
    if (isEdit) {
      setIsBootstrapping(true);
      API.get(`/scholarships/${id}`)
        .then((res) => {
          const s = res.data.data;
          setTitle(s.title || '');
          setDescription(s.description || '');
          setCurrency(s.currency || getCurrency(ADMIN_COUNTRY));
          setState(s.state || '');
          setCity(s.city || '');
          setSchType(s.type || 'Public');
          setCoverage(s.coverage || []);
          setDeadline(formatDateToISO(s.deadline));
          setMinPercentage(s.eligibility?.minPercentage || '');
          setMinGrade(s.eligibility?.minGrade || '');
          setEligibilityDesc(s.eligibility?.description || '');
          const contacts = Array.isArray(s.contactInfo)
            ? s.contactInfo.map((item) => ({
                email: item?.email || '',
                phone: item?.phone || '',
              }))
            : [];
          setContactInfo(contacts.length > 0 ? contacts : [emptyContact()]);
          setContact(s.contact || '');
          setTestDate(formatDateToISO(s.testDate));
          setInterviewDate(formatDateToISO(s.interviewDate));
          setDuration(s.duration || '');
          setAmount(s.amount || '');
          setProvider(s.provider || '');
          setWebsite(s.website || '');
          setAddress(s.address || '');
          setThumbnailPreview(s.thumbnail || '');
          setSelectedSteps(s.applicationSteps || ['Applied']);
          
          const normalizedPrograms = Array.isArray(s.programs)
            ? s.programs.map(normalizeScholarshipProgram)
            : [];

          const bach = normalizedPrograms.filter((p) => p.type === 'Bachelor');
          const mast = normalizedPrograms.filter((p) => p.type !== 'Bachelor');
          setBachelorPrograms(bach.length > 0 ? bach : [emptyProgram('Bachelor')]);
          setMasterPrograms(mast.length > 0 ? mast : [emptyProgram('Master')]);
          setLinkedUniversities(s.linkedUniversities?.map(u => typeof u === 'string' ? u : u._id) || []);
        })
        .catch((err) => {
          console.error('Fetch error:', err);
          alert('Failed to fetch scholarship data');
        })
        .finally(() => setIsBootstrapping(false));

      // Fetch all universities for selection
      API.get('/universities/admin/list')
        .then(res => setAllUniversities(res.data.data || []))
        .catch(err => console.error('Univ fetch error:', err));
    } else {
      setTitle('');
      setDescription('');
      setState('');
      setCity('');
      setCurrency(getCurrency(ADMIN_COUNTRY));
      setSchType('Public');
      setCoverage([]);
      setDeadline('');
      setMinPercentage('');
      setMinGrade('');
      setEligibilityDesc('');
      setContactInfo([emptyContact()]);
      setContact('');
      setTestDate('');
      setInterviewDate('');
      setDuration('');
      setAmount('');
      setProvider('');
      setWebsite('');
      setAddress('');
      setThumbnailPreview('');
      setBachelorPrograms([emptyProgram('Bachelor')]);
      setMasterPrograms([emptyProgram('Master')]);
      setLinkedUniversities([]);
      setSelectedSteps(['Applied']);

      // Fetch all universities for selection
      API.get('/universities/admin/list')
        .then(res => setAllUniversities(res.data.data || []))
        .catch(err => console.error('Univ fetch error:', err));
    }
  }, [id, isEdit]);

  const states = getStates(ADMIN_COUNTRY);
  const cities = getCities(ADMIN_COUNTRY, state);

  const toggleStep = (step) => {
    if (step === 'Applied') return; // locked
    setSelectedSteps((prev) =>
      prev.includes(step) ? prev.filter((s) => s !== step) : [...prev, step]
    );
  };

  const handleStateChange = (val) => { setState(val); setCity(''); };

  const handleImageChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    let compressedFile = file;
    try {
      const options = {
        maxSizeMB: 2,
        maxWidthOrHeight: 1920,
        useWebWorker: true,
        initialQuality: 0.9
      };
      compressedFile = await imageCompression(file, options);
    } catch (error) {
      console.error("Compression error:", error);
    }

    const reader = new FileReader();
    reader.onloadend = () => setThumbnailPreview(reader.result);
    reader.readAsDataURL(compressedFile);
  };

  const toggleCoverage = (item) => {
    setCoverage((prev) =>
      prev.includes(item) ? prev.filter((c) => c !== item) : [...prev, item]
    );
  };

  const updateProgram = useCallback((group, idx, field, val) => {
    const setter = group === 'Bachelor' ? setBachelorPrograms : setMasterPrograms;
    setter((prev) => prev.map((p, i) => (i === idx ? { ...p, [field]: val } : p)));
  }, []);

  const addProgram = useCallback((group) => {
    const setter = group === 'Bachelor' ? setBachelorPrograms : setMasterPrograms;
    setter((prev) => [...prev, emptyProgram(group)]);
  }, []);

  const removeProgram = useCallback((group, idx) => {
    const setter = group === 'Bachelor' ? setBachelorPrograms : setMasterPrograms;
    setter((prev) => {
      if (prev.length === 1) return prev;
      return prev.filter((_, i) => i !== idx);
    });
  }, []);

  const updateContact = (idx, field, value) => {
    setContactInfo((prev) =>
      prev.map((item, itemIdx) =>
        itemIdx === idx ? { ...item, [field]: value } : item
      )
    );
  };

  const addContact = () => {
    setContactInfo((prev) => [...prev, emptyContact()]);
  };

  const removeContact = (idx) => {
    setContactInfo((prev) => {
      if (prev.length === 1) return prev;
      return prev.filter((_, itemIdx) => itemIdx !== idx);
    });
  };

  const toggleUniversity = useCallback((uniId) => {
    setLinkedUniversities(prev => 
      prev.includes(uniId) ? prev.filter(id => id !== uniId) : [...prev, uniId]
    );
  }, []);

  const selectAllFiltered = (filtered) => {
    const ids = filtered.map(u => u._id);
    setLinkedUniversities(prev => [...new Set([...prev, ...ids])]);
  };

  const deselectAllFiltered = (filtered) => {
    const ids = filtered.map(u => u._id);
    setLinkedUniversities(prev => prev.filter(id => !ids.includes(id)));
  };

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const scrollToSection = (id) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return alert('Scholarship title is required');
    if (!description.trim()) return alert('Description is required');
    setLoading(true);
    try {
      const payload = {
        title,
        description,
        country: ADMIN_COUNTRY,
        state,
        city,
        address,
        currency,
        type: schType,
        coverage,
        deadline: deadline || undefined,
        eligibility: {
        minPercentage: minPercentage ? Number(minPercentage) : undefined,
        minGrade,
        description: eligibilityDesc,
        },
        contactInfo: contactInfo
          .map((item) => ({
            email: item.email?.trim() || '',
            phone: item.phone?.trim() || '',
          }))
          .filter((item) => item.email || item.phone),
        contact,
        programs: [...bachelorPrograms, ...masterPrograms]
          .map((p) => normalizeProgramPayload(p, p?.type))
          .filter((p) => p && p.name && p.name.trim() !== '' && p.name !== 'Other')
          .map((p) => ({ ...p, name: p.name.trim() })),
        duration,
        amount,
        provider,
        website,
        testDate: testDate || undefined,
        interviewDate: interviewDate || undefined,
        linkedUniversities,
        applicationSteps: selectedSteps,
        isActive: true,
        thumbnail: thumbnailPreview || undefined,
      };

      const saveScholarship = (body) =>
        (isEdit ? API.put(`/scholarships/${id}`, body) : API.post('/scholarships', body));

      const successMessage = isEdit
        ? 'Scholarship updated successfully!'
        : 'Scholarship published successfully!';

      await saveScholarship(payload);

      showToast(successMessage);
      setTimeout(() => navigate('/scholarships'), 1500);
    } catch (err) {
      console.error('Scholarship save error:', err);
      alert(err.response?.data?.message || 'Failed to save scholarship');
    } finally {
      setLoading(false);
    }
  };

  if (isEdit && isBootstrapping) {
    return (
      <div className="form-page" style={{ minHeight: '60vh', display: 'grid', placeItems: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 42, height: 42, border: '3px solid #dbe3ec', borderTopColor: 'var(--primary)', borderRadius: '50%', margin: '0 auto', animation: 'spin 0.8s linear infinite' }} />
          <p style={{ marginTop: 14, color: 'var(--text-secondary)', fontWeight: 600 }}>
            Loading scholarship data...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="form-page">
      {toast && <Toast msg={toast} />}

      <div className="form-page-header">
        {isEdit && <button className="btn-back" onClick={() => navigate('/scholar-history')}>←</button>}
        <div>
          <h2>🎓 {isEdit ? 'Edit' : 'Create New'} Scholarship</h2>
          {!isEdit && <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 4 }}>Publish a new scholarship opportunity</p>}
        </div>
      </div>

      <div className="form-quick-nav" role="navigation" aria-label="Scholarship form sections">
        {SCHOLARSHIP_SECTION_NAV.map((section) => (
          <button key={section.id} type="button" onClick={() => scrollToSection(section.id)}>
            {section.label}
          </button>
        ))}
      </div>

      <div className="form-helper-card">
        <h4>Quick Tips</h4>
        <p>
          Add title, location and deadline first, then select eligible programs and linked universities. Keep details
          short and clear so users can understand the scholarship quickly.
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        {/* ── Basic Info ── */}
        <div id="sch-basic" className="form-section" >
          <div className="form-section-title">🎓 Basic Information</div>
          <p className="form-section-help">Add a clear title and provider so users trust the scholarship post.</p>

          <div className="form-row single">
            <div className="form-group">
              <label>Scholarship Title *</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. HEC Need-Based Scholarship 2025"
                required
              />
            </div>
          </div>

          <div className="form-row" style={{ marginTop: 16 }}>
            <div className="form-group">
              <label>Provider / Organization</label>
              <input
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                placeholder="e.g. Higher Education Commission"
              />
            </div>
            <div className="form-group">
              <label>Type</label>
              <select value={schType} onChange={(e) => setSchType(e.target.value)}>
                <option>Public</option>
                <option>Private</option>
                <option>Semi-Government</option>
              </select>
            </div>
            <div className="form-group">
              <label>Website <span className="optional-hint">(optional)</span></label>
              <input
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://scholarship-provider.org"
                type="url"
              />
            </div>
          </div>

          <div className="form-row single" style={{ marginTop: 16 }}>
            <div className="form-group">
              <label>Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the scholarship, its purpose and benefits..."
                rows={4}
              />
            </div>
          </div>
        </div>

        {/* ── Location ── */}
        <div id="sch-location" className="form-section" >
          <div className="form-section-title">📍 Location</div>
          <p className="form-section-help">Set the target region so users can instantly see relevance.</p>
          <div className="form-row">
            <div className="form-group">
              <label>State <span className="optional-hint">(optional)</span></label>
              <select value={state} onChange={(e) => handleStateChange(e.target.value)}>
                <option value="">Select State</option>
                {states.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>City <span className="optional-hint">(optional)</span></label>
              <select value={city} onChange={(e) => setCity(e.target.value)} disabled={!state}>
                <option value="">Select City</option>
                {cities.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div className="form-row single" style={{ marginTop: 16 }}>
            <div className="form-group">
              <label>Full Address / Specific Location</label>
              <textarea
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="e.g. Higher Education Commission, Sector H-9, Islamabad"
                rows={2}
              />
            </div>
          </div>
        </div>

        {/* ── Contact Info ── */}
        <div id="sch-contact" className="form-section" >
          <div className="form-section-title">📞 Contact Info</div>
          <p className="form-section-help">Add support email/phone details that users can contact directly.</p>
          
          <div className="form-row single" style={{ marginBottom: 20 }}>
            <div className="form-group">
              <label>Contact Information (Box)</label>
              <textarea
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="e.g. Contact us at 0300-1234567 or scholarship@provider.org"
                rows={3}
              />
            </div>
          </div>

          <div className="programs-list">
            {contactInfo.map((contact, idx) => (
              <div className="program-card" key={`sch-contact-${idx}`}>
                <div className="program-card-header">
                  <h4>Contact #{idx + 1}</h4>
                  {contactInfo.length > 1 && (
                    <button type="button" className="btn-remove" onClick={() => removeContact(idx)}>×</button>
                  )}
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Email <span className="optional-hint">(optional)</span></label>
                    <input
                      type="email"
                      value={contact.email}
                      onChange={(e) => updateContact(idx, 'email', e.target.value)}
                      placeholder="e.g. scholarship@provider.org"
                    />
                  </div>
                  <div className="form-group">
                    <label>Phone Number <span className="optional-hint">(optional)</span></label>
                    <input
                      type="text"
                      value={contact.phone}
                      onChange={(e) => updateContact(idx, 'phone', e.target.value)}
                      placeholder="e.g. +92 300 1234567"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <button type="button" className="btn-add-program" onClick={addContact}>
            ➕ Add Another Contact
          </button>
        </div>

        {/* ── Thumbnail ── */}
        <div id="sch-thumbnail" className="form-section" >
          <div className="form-section-title">🖼️ Scholarship Thumbnail</div>
          <p className="form-section-help">Use a clean image so scholarship cards look professional on mobile.</p>
          <div className="image-upload-area">
            <input type="file" accept="image/*" onChange={handleImageChange} />
            {thumbnailPreview ? (
              <img src={resolveAssetUrl(thumbnailPreview)} alt="Preview" className="upload-preview" />
            ) : (
              <div className="upload-placeholder">
                <span className="upload-icon">📷</span>
                <p className="upload-text">
                  <strong>Click to upload</strong> or drag & drop<br />
                  PNG, JPG, WEBP up to 10MB
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ── Coverage ── */}
        <div id="sch-coverage" className="form-section" >
          <div className="form-section-title">💰 Coverage</div>
          <p className="form-section-help">Select benefits users can expect from this scholarship offer.</p>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
            Select what this scholarship covers:
          </p>
          <div className="coverage-grid">
            {COVERAGE_OPTIONS.map((item) => (
              <div
                key={item}
                className={`coverage-chip ${coverage.includes(item) ? 'selected' : ''}`}
                onClick={() => toggleCoverage(item)}
              >
                {coverage.includes(item) ? '✓ ' : ''}{item}
              </div>
            ))}
          </div>
        </div>

        {/* ── Deadline & Details ── */}
        <div id="sch-deadline" className="form-section" >
          <div className="form-section-title">📅 Deadline & Details</div>
          <p className="form-section-help">Keep deadline and amount accurate for better conversion and trust.</p>
          <div className="form-row three">
            <div className="form-group">
              <label>Deadline <span className="optional-hint">(optional)</span></label>
              <input
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>Amount / Value ({currency || 'PKR'}) <span className="optional-hint">(optional)</span></label>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="e.g. 5,000"
              />
            </div>
            <div className="form-group">
              <label>Duration</label>
              <input
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                placeholder="e.g. 4 Years / Full Program"
              />
            </div>
          </div>

          <div className="form-row" style={{ marginTop: 16 }}>
            <div className="form-group">
              <label>General Test Date <span className="optional-hint">(Optional)</span></label>
              <input type="date" value={testDate} onChange={(e) => setTestDate(e.target.value)} />
            </div>
            <div className="form-group">
              <label>General Interview Date <span className="optional-hint">(Optional)</span></label>
              <input type="date" value={interviewDate} onChange={(e) => setInterviewDate(e.target.value)} />
            </div>
          </div>
        </div>

        {/* ── Application Tracking Steps ── */}
        <div id="sch-steps" className="form-section" >
          <div className="form-section-title">
            📊 Application Tracking Steps
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 4, fontWeight: 400 }}>
              Select steps that apply to this scholarship
            </span>
          </div>
          <p className="form-section-help">Enable only steps that are truly part of the scholarship workflow.</p>
          <div className="steps-selector">
            {ALL_STEPS.map((step) => {
              const isLocked = step === 'Applied';
              const isSelected = selectedSteps.includes(step);
              return (
                <div
                  key={step}
                  className={`step-chip ${isSelected ? 'selected' : ''} ${isLocked ? 'locked' : ''}`}
                  onClick={() => toggleStep(step)}
                >
                  {isSelected ? '✓ ' : ''}{step}
                  {isLocked && ' 🔒'}
                </div>
              );
            })}
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 14 }}>
            ℹ️ "Applied" is always included. Selected steps will be shown as a tracker on the scholarship detail page.
          </p>
        </div>


        {/* ── Bachelor Programs ── */}
        <div id="sch-programs-bachelor" className="form-section" >
          <div className="form-section-title">📘 Bachelor Programs</div>
          <p className="form-section-help">Choose exactly where this scholarship applies at bachelor level.</p>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
            Which Bachelor programs is this scholarship offered for?
          </p>
          <div className="programs-list">
            {bachelorPrograms.map((prog, idx) => (
              <ScholarshipProgramItem
                key={`sbach-${idx}`}
                prog={prog}
                idx={idx}
                group="Bachelor"
                onUpdate={updateProgram}
                onRemove={removeProgram}
                programOptions={BACHELOR_PROGRAMS}
              />
            ))}
          </div>
          <button type="button" className="btn-add-program" onClick={() => addProgram('Bachelor')}>
            ➕ Add Another Bachelor Program
          </button>
        </div>

        {/* ── Master Programs ── */}
        <div id="sch-programs-master" className="form-section" >
          <div className="form-section-title">📙 Master / PhD Programs</div>
          <p className="form-section-help">Keep postgrad program scope clear to avoid user confusion.</p>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
            Which Master/PhD programs is this scholarship offered for?
          </p>
          <div className="programs-list">
            {masterPrograms.map((prog, idx) => (
              <ScholarshipProgramItem
                key={`smast-${idx}`}
                prog={prog}
                idx={idx}
                group="Master"
                onUpdate={updateProgram}
                onRemove={removeProgram}
                programOptions={MASTER_PROGRAMS}
              />
            ))}
          </div>
          <button type="button" className="btn-add-program" onClick={() => addProgram('Master')} style={{ background: 'rgba(247, 37, 133, 0.1)', color: '#f72585' }}>
            ➕ Add Another Master Program
          </button>
        </div>

        {/* ── Eligibility ── */}
        <div id="sch-eligibility" className="form-section" >
          <div className="form-section-title">✅ Eligibility Criteria</div>
          <p className="form-section-help">Write requirements in plain language so users can self-check quickly.</p>

          <div className="form-row">
            <div className="form-group">
              <label>Minimum Percentage (%) <span className="optional-hint">(optional)</span></label>
              <input
                type="number"
                value={minPercentage}
                onChange={(e) => setMinPercentage(e.target.value)}
                placeholder="e.g. 70"
                min={0}
                max={100}
              />
            </div>
            <div className="form-group">
              <label>Minimum Grade / GPA <span className="optional-hint">(optional)</span></label>
              <input
                value={minGrade}
                onChange={(e) => setMinGrade(e.target.value)}
                placeholder="e.g. B+ or 3.0 GPA"
              />
            </div>
          </div>

          <div className="form-row single" style={{ marginTop: 16 }}>
            <div className="form-group">
              <label>Eligibility Description</label>
              <textarea
                value={eligibilityDesc}
                onChange={(e) => setEligibilityDesc(e.target.value)}
                placeholder="List all eligibility requirements, e.g.&#10;- Must be Pakistani citizen&#10;- Maximum age: 30 years&#10;- No active scholarship from another source"
                rows={5}
              />
            </div>
          </div>
        </div>

        {/* ── Linked Universities ── */}
        <div id="sch-universities" className="form-section" >
          <div className="form-section-title">🏛️ Linked Universities</div>
          <p className="form-section-help">Pick participating universities to guide users to the right destination.</p>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
            Select universities that are participating in this scholarship program. Use the search to find specific ones.
          </p>

          <div style={{ marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input 
              type="text" 
              placeholder="🔍 Search universities by name..." 
              value={searchTermUni} 
              onChange={(e) => setSearchTermUni(e.target.value)}
              style={{ 
                width: '100%', 
                padding: '12px 16px', 
                borderRadius: '12px', 
                border: '1px solid var(--border)',
                background: 'rgba(0,0,0,0.03)',
                fontSize: 14
              }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <label className="toggle-switch" style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: 10 }}>
                <input 
                  type="checkbox" 
                  checked={showSelectedOnly} 
                  onChange={(e) => setShowSelectedOnly(e.target.checked)}
                  style={{ width: 18, height: 18, cursor: 'pointer' }}
                />
                <span style={{ fontSize: 13, fontWeight: '600', color: showSelectedOnly ? 'var(--primary)' : 'var(--text-secondary)' }}>
                  ✨ Show Selected Only ({linkedUniversities.length})
                </span>
              </label>
            </div>
          </div>

          {allUniversities.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', fontStyle: 'italic' }}>
              No universities found. Please create universities first.
            </p>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 10, marginBottom: 15 }}>
                <button 
                  type="button" 
                  className="btn-save-draft" 
                  style={{ padding: '6px 12px', fontSize: 11 }}
                  onClick={() => selectAllFiltered(filteredUniversities)}
                >
                  Select All Visible
                </button>
                <button 
                  type="button" 
                  className="btn-save-draft" 
                  style={{ padding: '6px 12px', fontSize: 11 }}
                  onClick={() => deselectAllFiltered(filteredUniversities)}
                >
                  Deselect All Visible
                </button>
                <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-secondary)', alignSelf: 'center' }}>
                  {linkedUniversities.length} selected
                </span>
              </div>

              <div style={{ 
                maxHeight: '350px', 
                overflowY: 'auto', 
                border: '1px solid var(--border)', 
                borderRadius: '12px',
                padding: '10px',
                background: 'rgba(0,0,0,0.01)'
              }}>
                {filteredUniversities.length === 0 ? (
                  <p style={{ textAlign: 'center', padding: '20px', color: 'var(--text-secondary)' }}>No matches found.</p>
                ) : (
                  filteredUniversities.map((uni) => (
                    <UniversitySelectionItem
                      key={uni._id}
                      uni={uni}
                      isSelected={linkedUniversities.includes(uni._id)}
                      onClick={toggleUniversity}
                    />
                  ))
                )}
              </div>
            </>
          )}
        </div>

        {/* ── Submit Bar ── */}
        <div className="form-submit-bar">
          <button type="button" className="btn-save-draft" onClick={() => navigate('/scholarships')}>
            Cancel
          </button>
          <button type="submit" className="btn-publish" disabled={loading}>
            {loading ? '⏳ Saving...' : isEdit ? '💾 Update Scholarship' : '🚀 Publish Scholarship'}
          </button>
        </div>
      </form>
    </div>
  );
}
