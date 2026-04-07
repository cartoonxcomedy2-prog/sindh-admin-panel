import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import API, { resolveAssetUrl } from '../api';
import imageCompression from 'browser-image-compression';
import { getStates, getCities, getCurrency } from '../data/locations';
import { BACHELOR_PROGRAMS, MASTER_PROGRAMS } from '../data/programs';
import '../forms.css';

const ALL_STEPS = ['Applied', 'Admit Card', 'Test', 'Interview'];
// Note: 'Selected' and 'Rejected' are outcomes set by the system after application review — not pre-defined steps
const DURATIONS = ['1 Year', '2 Years', '3 Years', '4 Years', '5 Years', '6 Years'];
const FEE_STRUCTURES = ['Per Semester', 'Per Year'];
const UNIVERSITY_SECTION_NAV = [
  { id: 'uni-basic', label: 'Basic' },
  { id: 'uni-location', label: 'Location' },
  { id: 'uni-thumbnail', label: 'Thumbnail' },
  { id: 'uni-admissions', label: 'Admissions' },
  { id: 'uni-contact', label: 'Contact Info' },
  { id: 'uni-steps', label: 'Tracking Steps' },
  { id: 'uni-programs-bachelor', label: 'Bachelor Programs' },
  { id: 'uni-programs-master', label: 'Master/PhD Programs' },
  { id: 'uni-eligibility', label: 'Eligibility' },
];

const emptyProgram = (type) => ({
  name: '',
  type: type || 'Bachelor',
  duration: type === 'Master' ? '2 Years' : '4 Years',
  feeStructure: 'Per Year',
  feeAmount: '',
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

const normalizeUniversityProgram = (program = {}) => {
  const name = program.name || program.programName || '';
  const type = normalizeProgramType(program.type || program.programType || program.level, name);

  return {
    name,
    type,
    duration: program.duration || (type === 'Bachelor' ? '4 Years' : '2 Years'),
    feeStructure: program.feeStructure || program.feeType || 'Per Year',
    feeAmount: program.feeAmount ?? program.fee ?? '',
  };
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

export default function CreateUniversity() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = !!id;
  const [loading, setLoading] = useState(false);
  const [isBootstrapping, setIsBootstrapping] = useState(false);
  const [toast, setToast] = useState('');

  // Basic info
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [state, setState] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [currency, setCurrency] = useState('');
  const [thumbnailPreview, setThumbnailPreview] = useState('');
  const [uniType, setUniType] = useState('Public');
  const [international, setInternational] = useState(false);
  const [appFees, setAppFees] = useState('');
  const [deadline, setDeadline] = useState('');
  const [testDate, setTestDate] = useState('');
  const [interviewDate, setInterviewDate] = useState('');
  const [website, setWebsite] = useState('');

  // Programs (Grouped)
  const [bachelorPrograms, setBachelorPrograms] = useState([emptyProgram('Bachelor')]);
  const [masterPrograms, setMasterPrograms] = useState([emptyProgram('Master')]);

  // University-wide (centralized) fields
  const [eligibility, setEligibility] = useState('');
  const [scholarshipDetails, setScholarshipDetails] = useState('');
  const [contactInfo, setContactInfo] = useState([emptyContact()]);
  const [contact, setContact] = useState('');

  // Application Steps (Applied is always on)
  const [selectedSteps, setSelectedSteps] = useState(['Applied']);

  useEffect(() => {
    if (isEdit) {
      setIsBootstrapping(true);
      API.get(`/universities/${id}`)
        .then((res) => {
          const u = res.data.data;
          setName(u.name || '');
          setDescription(u.description || '');
          setState(u.state || '');
          setCity(u.city || '');
          setAddress(u.address || '');
          setCurrency(u.currency || getCurrency(ADMIN_COUNTRY));
          setThumbnailPreview(u.thumbnail || '');
          setUniType(u.type || 'Public');
          setInternational(u.internationalStudents || false);
          setAppFees(u.applicationFees || '');
          setDeadline(formatDateToISO(u.deadline));
          setTestDate(formatDateToISO(u.testDate));
          setInterviewDate(formatDateToISO(u.interviewDate));
          setWebsite(u.website || '');
          setEligibility(u.eligibility || '');
          setScholarshipDetails(u.scholarshipDetails || '');
          setSelectedSteps(u.applicationSteps || ['Applied']);
          const contacts = Array.isArray(u.contactInfo)
            ? u.contactInfo.map((item) => ({
                email: item?.email || '',
                phone: item?.phone || '',
              }))
            : [];
          setContactInfo(contacts.length > 0 ? contacts : [emptyContact()]);
          setContact(u.contact || '');
          
          const normalizedPrograms = Array.isArray(u.programs)
            ? u.programs.map(normalizeUniversityProgram)
            : [];

          const bach = normalizedPrograms.filter((p) => p.type === 'Bachelor');
          const mast = normalizedPrograms.filter((p) => p.type !== 'Bachelor');
          setBachelorPrograms(bach.length > 0 ? bach : [emptyProgram('Bachelor')]);
          setMasterPrograms(mast.length > 0 ? mast : [emptyProgram('Master')]);
        })
        .catch((err) => {
          console.error('Fetch error:', err);
          alert('Failed to fetch university data');
        })
        .finally(() => setIsBootstrapping(false));
    } else {
      // Clear all fields if switching from Edit to Create
      setName('');
      setDescription('');
      setState('');
      setCity('');
      setAddress('');
      setCurrency(getCurrency(ADMIN_COUNTRY));
      setThumbnailPreview('');
      setUniType('Public');
      setInternational(false);
      setAppFees('');
      setDeadline('');
      setTestDate('');
      setInterviewDate('');
      setWebsite('');
      setEligibility('');
      setScholarshipDetails('');
      setContactInfo([emptyContact()]);
      setContact('');
      setSelectedSteps(['Applied']);
      setBachelorPrograms([emptyProgram('Bachelor')]);
      setMasterPrograms([emptyProgram('Master')]);
    }
  }, [id, isEdit]);

  const states = getStates(ADMIN_COUNTRY);
  const cities = getCities(ADMIN_COUNTRY, state);

  const handleStateChange = (val) => {
    setState(val);
    setCity('');
  };

  const handleImageChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    let compressedFile = file;
    try {
      const options = {
        maxSizeMB: 1,
        maxWidthOrHeight: 1200,
        useWebWorker: true
      };
      compressedFile = await imageCompression(file, options);
    } catch (error) {
      console.error("Compression error:", error);
    }

    const reader = new FileReader();
    reader.onloadend = () => setThumbnailPreview(reader.result);
    reader.readAsDataURL(compressedFile);
  };

  const toggleStep = (step) => {
    if (step === 'Applied') return; // locked
    setSelectedSteps((prev) =>
      prev.includes(step) ? prev.filter((s) => s !== step) : [...prev, step]
    );
  };

  // Programs handlers
  const updateProgram = (group, idx, field, val) => {
    const setter = group === 'Bachelor' ? setBachelorPrograms : setMasterPrograms;
    setter((prev) => prev.map((p, i) => (i === idx ? { ...p, [field]: val } : p)));
  };

  const addProgram = (group) => {
    const setter = group === 'Bachelor' ? setBachelorPrograms : setMasterPrograms;
    setter((prev) => [...prev, emptyProgram(group)]);
  };

  const removeProgram = (group, idx) => {
    const setter = group === 'Bachelor' ? setBachelorPrograms : setMasterPrograms;
    setter((prev) => {
      if (prev.length === 1) return prev;
      return prev.filter((_, i) => i !== idx);
    });
  };

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
    if (!name.trim()) return alert('University name is required');
    setLoading(true);
    try {
      const payload = {
        name,
        description,
        country: ADMIN_COUNTRY,
        state,
        city,
        address,
        currency,
        type: uniType,
        internationalStudents: international,
        applicationFees: appFees || undefined,
        deadline: deadline || undefined,
        testDate: testDate || undefined,
        interviewDate: interviewDate || undefined,
        website,
        eligibility,
        scholarshipDetails,
        contactInfo: contactInfo
          .map((item) => ({
            email: item.email?.trim() || '',
            phone: item.phone?.trim() || '',
          }))
          .filter((item) => item.email || item.phone),
        contact,
        isActive: true,
        programs: [...bachelorPrograms, ...masterPrograms].filter((p) => p.name.trim()),
        applicationSteps: selectedSteps,
        thumbnail: thumbnailPreview || undefined,
      };

      if (isEdit) {
        await API.put(`/universities/${id}`, payload);
        showToast('University updated successfully!');
      } else {
        await API.post('/universities', payload);
        showToast('University created successfully!');
      }
      setTimeout(() => navigate(isEdit ? '/uni-history' : '/universities'), 1500);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to save university');
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
            Loading university data...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="form-page">
      {toast && <Toast msg={toast} />}

      <div className="form-page-header">
        <div>
          <h2>🏛️ {isEdit ? 'Edit University' : 'Create New University'}</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 4 }}>
            {isEdit ? 'Update the details for this university record' : 'Fill in the details to publish a new university record'}
          </p>
        </div>
      </div>

      <div className="form-quick-nav" role="navigation" aria-label="University form sections">
        {UNIVERSITY_SECTION_NAV.map((section) => (
          <button key={section.id} type="button" onClick={() => scrollToSection(section.id)}>
            {section.label}
          </button>
        ))}
      </div>

      <div className="form-helper-card">
        <h4>Quick Tips</h4>
        <p>
          Fill required fields first, then programs and fees. Long names and values are allowed and will be saved
          safely. You can add multiple programs before publishing.
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        {/* ── Basic Information ── */}
        <div id="uni-basic" className="form-section" >
          <div className="form-section-title">🏛️ Basic Information</div>
          <p className="form-section-help">Start with identity details users see first in app listings.</p>

          <div className="form-row single">
            <div className="form-group">
              <label>University Name *</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. University of Oxford"
                required
              />
            </div>
          </div>

          <div className="form-row single" style={{ marginTop: 16 }}>
            <div className="form-group">
              <label>Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description about the university..."
                rows={4}
              />
            </div>
          </div>

          <div className="form-row" style={{ marginTop: 16 }}>
            <div className="form-group">
              <label>University Type</label>
              <select value={uniType} onChange={(e) => setUniType(e.target.value)}>
                <option>Public</option>
                <option>Private</option>
                <option value="Semi-Public">Semi-Public</option>
              </select>
            </div>
            <div className="form-group">
              <label>Website <span className="optional-hint">(optional)</span></label>
              <input
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://university.edu"
                type="url"
              />
            </div>
          </div>
        </div>

        {/* ── Location ── */}
        <div id="uni-location" className="form-section" >
          <div className="form-section-title">📍 Location</div>
          <p className="form-section-help">Accurate location helps users find relevant universities faster.</p>
          <div className="form-row">
            <div className="form-group">
              <label>State / Province</label>
              <select value={state} onChange={(e) => handleStateChange(e.target.value)}>
                <option value="">Select State</option>
                {states.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>City</label>
              <select value={city} onChange={(e) => setCity(e.target.value)} disabled={!state}>
                <option value="">Select City</option>
                {cities.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div className="form-row single" style={{ marginTop: 16 }}>
            <div className="form-group">
              <label>Full Address / Location Box</label>
              <textarea
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="e.g. Sector H-9, Islamabad, Pakistan"
                rows={2}
              />
            </div>
          </div>
        </div>

        {/* ── Thumbnail ── */}
        <div id="uni-thumbnail" className="form-section" >
          <div className="form-section-title">🖼️ Thumbnail Image</div>
          <p className="form-section-help">Upload a clear landscape image so listing cards look clean and consistent.</p>
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

        {/* ── Admissions ── */}
        <div id="uni-admissions" className="form-section" >
          <div className="form-section-title">📅 Admissions & Fees</div>
          <p className="form-section-help">Set deadline and application fee clearly so users can decide quickly.</p>

          <div className="form-row">
            <div className="form-group">
              <label>Application Deadline</label>
              <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Application Fees ({currency || 'PKR'})</label>
              <input type="number" value={appFees} onChange={(e) => setAppFees(e.target.value)} placeholder="e.g. 5000" min={0} />
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

          <div style={{ marginTop: 20 }}>
            <div className="toggle-row">
              <div className="toggle-row-info">
                <h4>🌍 International Students</h4>
                <p>Does this university accept international students?</p>
              </div>
              <div
                className={`toggle ${international ? 'on' : ''}`}
                onClick={() => setInternational(!international)}
              />
            </div>
          </div>
        </div>

        {/* ── Contact Info ── */}
        <div id="uni-contact" className="form-section" >
          <div className="form-section-title">📞 Contact Info</div>
          <p className="form-section-help">Add official email and phone numbers. These will show in user app details.</p>
          
          <div className="form-row single" style={{ marginBottom: 20 }}>
            <div className="form-group">
              <label>Contact Information (Box)</label>
              <textarea
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="e.g. Contact us at 0300-1234567 or admissions@university.edu.pk"
                rows={3}
              />
            </div>
          </div>

          <div className="programs-list">
            {contactInfo.map((contact, idx) => (
              <div className="program-card" key={`uni-contact-${idx}`}>
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
                      placeholder="e.g. admissions@university.edu.pk"
                    />
                  </div>
                  <div className="form-group">
                    <label>Phone Number <span className="optional-hint">(optional)</span></label>
                    <input
                      type="text"
                      value={contact.phone}
                      onChange={(e) => updateContact(idx, 'phone', e.target.value)}
                      placeholder="e.g. +92 21 1234 5678"
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

        {/* ── Application Tracking Steps ── */}
        <div id="uni-steps" className="form-section" >
          <div className="form-section-title">
            📊 Application Tracking Steps
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 4, fontWeight: 400 }}>
              Select steps that apply to this university
            </span>
          </div>
          <p className="form-section-help">Only enable steps this university actually uses in its admission process.</p>
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
            ℹ️ "Applied" is always included. Selected steps will be shown as a tracker on the university detail page.
          </p>
        </div>

        {/* ── Bachelor Programs ── */}
        <div id="uni-programs-bachelor" className="form-section" >
          <div className="form-section-title">📘 Bachelor Programs</div>
          <p className="form-section-help">Add all bachelor offerings with duration and fee data in one place.</p>

          <div className="programs-list">
            {bachelorPrograms.map((prog, idx) => (
              <div className="program-card" key={`bach-${idx}`}>
                <div className="program-card-header">
                  <h4>Bachelor Program #{idx + 1}</h4>
                  {bachelorPrograms.length > 1 && (
                    <button type="button" className="btn-remove" onClick={() => removeProgram('Bachelor', idx)}>×</button>
                  )}
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Program Name *</label>
                    <select
                      value={prog.name}
                      onChange={(e) => updateProgram('Bachelor', idx, 'name', e.target.value)}
                    >
                      <option value="">Select Program</option>
                      {BACHELOR_PROGRAMS.map((p) => <option key={p} value={p}>{p}</option>)}
                      {prog.name && !BACHELOR_PROGRAMS.includes(prog.name) && prog.name !== 'Other' && (
                        <option value={prog.name}>{prog.name} (Existing)</option>
                      )}
                      <option value="Other">Other</option>
                    </select>
                    {prog.name === 'Other' && (
                      <input
                        style={{ marginTop: 8 }}
                        placeholder="Type program name..."
                        onChange={(e) => updateProgram('Bachelor', idx, 'name', e.target.value)}
                      />
                    )}
                  </div>
                  <div className="form-group">
                    <label>Program Type</label>
                    <div className="read-only-hint" style={{ padding: '12px 16px', borderRadius: '12px', fontSize: '14px' }}>📘 Bachelor (Undergraduate)</div>
                  </div>
                </div>

                <div className="form-row three" style={{ marginTop: 14 }}>
                  <div className="form-group">
                    <label>Duration</label>
                    <select value={prog.duration} onChange={(e) => updateProgram('Bachelor', idx, 'duration', e.target.value)}>
                      {DURATIONS.map((d) => <option key={d}>{d}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Fee Structure</label>
                    <select value={prog.feeStructure} onChange={(e) => updateProgram('Bachelor', idx, 'feeStructure', e.target.value)}>
                      {FEE_STRUCTURES.map((f) => <option key={f}>{f}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Fee Amount ({currency || 'PKR'})</label>
                    <input
                      type="number"
                      value={prog.feeAmount}
                      onChange={(e) => updateProgram('Bachelor', idx, 'feeAmount', e.target.value)}
                      placeholder="e.g. 75000"
                      min={0}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <button type="button" className="btn-add-program" onClick={() => addProgram('Bachelor')}>
            ➕ Add Another Bachelor Program
          </button>
        </div>

        {/* ── Master Programs ── */}
        <div id="uni-programs-master" className="form-section" >
          <div className="form-section-title">📙 Master / PhD Programs</div>
          <p className="form-section-help">Keep postgraduate programs separate so users compare degrees easily.</p>

          <div className="programs-list">
            {masterPrograms.map((prog, idx) => (
              <div className="program-card" key={`mast-${idx}`}>
                <div className="program-card-header">
                  <h4>Master/PhD Program #{idx + 1}</h4>
                  {masterPrograms.length > 1 && (
                    <button type="button" className="btn-remove" onClick={() => removeProgram('Master', idx)}>×</button>
                  )}
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Program Name *</label>
                    <select
                      value={prog.name}
                      onChange={(e) => updateProgram('Master', idx, 'name', e.target.value)}
                    >
                      <option value="">Select Program</option>
                      {MASTER_PROGRAMS.map((p) => <option key={p} value={p}>{p}</option>)}
                      {prog.name && !MASTER_PROGRAMS.includes(prog.name) && prog.name !== 'Other' && (
                        <option value={prog.name}>{prog.name} (Existing)</option>
                      )}
                      <option value="Other">Other</option>
                    </select>
                    {prog.name === 'Other' && (
                      <input
                        style={{ marginTop: 8 }}
                        placeholder="Type program name..."
                        onChange={(e) => updateProgram('Master', idx, 'name', e.target.value)}
                      />
                    )}
                  </div>
                  <div className="form-group">
                    <label>Program Type</label>
                    <select value={prog.type} onChange={(e) => updateProgram('Master', idx, 'type', e.target.value)}>
                      <option>Master</option>
                      <option>PhD</option>
                      <option>Diploma</option>
                      {prog.type && !['Master', 'PhD', 'Diploma'].includes(prog.type) && (
                        <option value={prog.type}>{prog.type} (Existing)</option>
                      )}
                    </select>
                  </div>
                </div>

                <div className="form-row three" style={{ marginTop: 14 }}>
                  <div className="form-group">
                    <label>Duration</label>
                    <select value={prog.duration} onChange={(e) => updateProgram('Master', idx, 'duration', e.target.value)}>
                      {DURATIONS.map((d) => <option key={d}>{d}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Fee Structure</label>
                    <select value={prog.feeStructure} onChange={(e) => updateProgram('Master', idx, 'feeStructure', e.target.value)}>
                      {FEE_STRUCTURES.map((f) => <option key={f}>{f}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Fee Amount ({currency || 'PKR'})</label>
                    <input
                      type="number"
                      value={prog.feeAmount}
                      onChange={(e) => updateProgram('Master', idx, 'feeAmount', e.target.value)}
                      placeholder="e.g. 75000"
                      min={0}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <button type="button" className="btn-add-program" onClick={() => addProgram('Master')} style={{ background: 'rgba(247, 37, 133, 0.1)', color: '#f72585' }}>
            ➕ Add Another Master Program
          </button>
        </div>

        {/* ── Centralized Eligibility & Scholarship ── */}
        <div id="uni-eligibility" className="form-section" >
          <div className="form-section-title">
            ✅ Eligibility & Scholarship Details
          </div>
          <p className="form-section-help">Write simple, scannable points so students understand criteria quickly.</p>
          <div className="form-row single">
            <div className="form-group">
              <label>Eligibility Requirements</label>
              <textarea
                value={eligibility}
                onChange={(e) => setEligibility(e.target.value)}
                placeholder={`e.g.\n• Intermediate with minimum 60% marks\n• Age limit: below 25 years\n• No previous degree in same field`}
                rows={5}
              />
            </div>
          </div>
          <div className="form-row single" style={{ marginTop: 16 }}>
            <div className="form-group">
              <label>Scholarship Details <span className="optional-hint">(optional)</span></label>
              <textarea
                value={scholarshipDetails}
                onChange={(e) => setScholarshipDetails(e.target.value)}
                placeholder={`e.g.\n• Merit-based: Top 10% get 50% fee waiver\n• Need-based: Full scholarship for deserving students\n• Sports quota available`}
                rows={5}
              />
            </div>
          </div>
        </div>

        {/* ── Submit Bar ── */}
        <div className="form-submit-bar">
          <button type="button" className="btn-save-draft" onClick={() => navigate('/universities')}>
            Cancel
          </button>
          <button type="submit" className="btn-publish" disabled={loading}>
            {loading ? '⏳ Saving...' : isEdit ? '💾 Update University' : '🚀 Publish University'}
          </button>
        </div>
      </form>
    </div>
  );
}
