import { useState, useEffect } from 'react';
import { Plus, Trash2, Image as ImageIcon, Loader2, Pencil, X } from 'lucide-react';
import API from '../api';

const getBannerItems = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
};

const getBannerItem = (payload) => (payload?.data ? payload.data : payload);

const Banners = () => {
  const [banners, setBanners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [formData, setFormData] = useState({ imageUrl: '', title: '' });
  const [preview, setPreview] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editingImageUrl, setEditingImageUrl] = useState('');

  const API_BASE = (API.defaults.baseURL || '').replace(/\/$/, '');
  const SERVER_URL = API_BASE.endsWith('/api') ? API_BASE.slice(0, -4) : API_BASE;

  useEffect(() => {
    fetchBanners();
  }, []);

  useEffect(() => {
    return () => {
      if (preview?.startsWith('blob:')) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const fetchBanners = async () => {
    try {
      const res = await API.get('/banners');
      setBanners(getBannerItems(res.data));
    } catch {
      setBanners([]);
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (preview?.startsWith('blob:')) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(file));

    const reader = new FileReader();
    reader.onloadend = () => {
      setFormData((prev) => ({ ...prev, imageUrl: reader.result || '' }));
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const finalImage = formData.imageUrl || editingImageUrl;

    if (!finalImage) {
      alert('Please select an image first');
      return;
    }

    setUploading(true);
    try {
      if (editingId) {
        const res = await API.patch(`/banners/${editingId}`, {
          title: formData.title,
          imageUrl: finalImage,
        });

        const updated = getBannerItem(res.data);
        setBanners((prev) => prev.map((b) => (b._id === editingId ? updated : b)));
      } else {
        const res = await API.post('/banners', {
          title: formData.title,
          imageUrl: finalImage,
        });

        const created = getBannerItem(res.data);
        setBanners((prev) => [created, ...prev]);
      }

      resetForm();
    } catch (err) {
      alert(err.response?.data?.message || 'Operation failed');
    } finally {
      setUploading(false);
    }
  };

  const resetForm = () => {
    if (preview?.startsWith('blob:')) URL.revokeObjectURL(preview);
    setFormData({ imageUrl: '', title: '' });
    setPreview(null);
    setEditingId(null);
    setEditingImageUrl('');
  };

  const handleEdit = (banner) => {
    setEditingId(banner._id);
    setEditingImageUrl(banner.imageUrl || '');
    setFormData({ title: banner.title || '', imageUrl: '' });
    setPreview(buildBannerImageUrl(banner.imageUrl));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Remove this slide from the app?')) return;

    try {
      await API.delete(`/banners/${id}`);
      setBanners((prev) => prev.filter((b) => b._id !== id));
    } catch (err) {
      alert(err.response?.data?.message || 'Delete failed');
    }
  };

  const buildBannerImageUrl = (imageUrl) => {
    if (!imageUrl) return '';
    if (imageUrl.startsWith('data:')) return imageUrl;
    if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) return imageUrl;
    if (imageUrl.startsWith('/uploads/')) return `${SERVER_URL}${imageUrl}`;
    return `${SERVER_URL}/uploads/${imageUrl}`;
  };

  if (loading) {
    return (
      <div className="loader-container">
        <Loader2 className="animate-spin" size={36} />
        <p>Loading Banner System...</p>
      </div>
    );
  }

  return (
    <div className="banner-page-wrapper">
      <header className="banner-header">
        <div>
          <h2>Slider Management</h2>
          <p>Add or remove quality landscape images for the app home screen</p>
        </div>
      </header>

      <div className="banner-grid-layout">
        <div className="upload-container">
          <div className="custom-card">
            <div className="card-header">
              {editingId ? <Pencil size={20} /> : <Plus size={20} />}
              <h3>{editingId ? 'Edit Existing Slide' : 'Create New Slide'}</h3>
            </div>

            <form onSubmit={handleSubmit} className="upload-form">
              <label className={`dropzone ${preview ? 'has-preview' : ''}`}>
                <input type="file" onChange={handleFileChange} accept="image/*" />
                {preview ? (
                  <img src={preview} alt="Preview" className="img-preview" />
                ) : (
                  <div className="dropzone-content">
                    <div className="icon-box">
                      <ImageIcon size={32} />
                    </div>
                    <span className="primary-text">Select Slide Image</span>
                    <span className="secondary-text">Landscape (16:9) recommended</span>
                  </div>
                )}
              </label>

              <div className="form-group" style={{ marginBottom: '0.2rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, color: '#475569' }}>
                  Banner Heading
                </label>
                <input
                  type="text"
                  placeholder="Enter heading text..."
                  value={formData.title}
                  onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
                  required
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: '10px',
                    border: '1px solid #E2E8F0',
                    background: '#F8FAFC',
                    fontSize: '0.9rem',
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="submit"
                  disabled={uploading || (!editingId && !formData.imageUrl)}
                  className="btn-upload-primary"
                  style={{ flex: 1 }}
                >
                  {uploading ? <Loader2 className="animate-spin" size={20} /> : editingId ? <Pencil size={20} /> : <Plus size={20} />}
                  {uploading ? (editingId ? 'Updating...' : 'Publishing...') : editingId ? 'Save Changes' : 'Publish Slide'}
                </button>

                {editingId && (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="btn-upload-primary"
                    style={{ flex: '0.3', background: '#94a3b8', boxShadow: 'none' }}
                  >
                    <X size={20} />
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>

        <div className="gallery-container">
          <div className="section-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ImageIcon size={18} color="#64748b" />
              <span>Active Slides Inventory</span>
            </div>
            <span
              style={{
                background: '#0f766e',
                color: 'white',
                padding: '4px 12px',
                borderRadius: '20px',
                fontSize: '12px',
                fontWeight: 800,
              }}
            >
              {banners.length} TOTAL
            </span>
          </div>

          <div className="slides-grid">
            {banners.length === 0 ? (
              <div className="empty-state">
                <ImageIcon size={48} strokeWidth={1} />
                <p>No slider images uploaded yet</p>
                <span>Images you upload will appear here for management</span>
              </div>
            ) : (
              banners.map((banner, index) => (
                <div key={banner._id} className="slide-card">
                  <div className="slide-image-box">
                    <img src={buildBannerImageUrl(banner.imageUrl)} alt={`Slide ${index + 1}`} />
                    <div className="slide-overlay">
                      <button
                        onClick={() => handleEdit(banner)}
                        className="btn-delete-slide"
                        style={{ background: '#0f766e', marginRight: '8px' }}
                        title="Edit Slide"
                      >
                        <Pencil size={18} />
                      </button>
                      <button onClick={() => handleDelete(banner._id)} className="btn-delete-slide" title="Remove Slide">
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                  <div className="slide-meta">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span className="index-badge">SLIDE #{banners.length - index}</span>
                      <span className="date-badge">{new Date(banner.createdAt).toLocaleDateString()}</span>
                    </div>
                    {banner.title && (
                      <p
                        style={{
                          fontSize: '13px',
                          fontWeight: 700,
                          color: '#1e293b',
                          marginTop: '4px',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        "{banner.title}"
                      </p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Banners;
