import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Lock, Mail, ShieldCheck, Eye, EyeOff, Loader2 } from 'lucide-react';
import API from '../api';

export default function LoginPage({ setAuth, setAdmin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const location = useLocation();

  const getLoginErrorMessage = (err) => {
    const status = err?.response?.status;
    const serverMessage = String(err?.response?.data?.message || '').trim();

    if (status === 401 || status === 403) {
      return 'Invalid email or password.';
    }
    if (status === 429) {
      return 'Too many login attempts. Please try again in a few minutes.';
    }
    if (!status) {
      return 'Unable to reach server. Please check your internet connection.';
    }

    // Avoid exposing raw backend/internal errors in authentication UI.
    if (serverMessage && !/incomingmessage|stack|syntaxerror|typeerror/i.test(serverMessage)) {
      return serverMessage;
    }

    return 'Login failed. Please try again.';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await API.post('/users/login', {
        email: email.trim().toLowerCase(),
        password,
      });
      const { token, ...adminData } = res.data;
      
      if (adminData.role === 'user') {
        setError('Unauthorized: You do not have permission to access the Admin Console.');
        setLoading(false);
        return;
      }
      
      localStorage.removeItem('token');
      localStorage.removeItem('admin');
      sessionStorage.removeItem('token');
      sessionStorage.removeItem('admin');

      const storage = rememberMe ? localStorage : sessionStorage;
      storage.setItem('token', token);
      storage.setItem('admin', JSON.stringify(adminData));
      
      setAdmin(adminData);
      setAuth(true);
      
      const params = new URLSearchParams(location.search || '');
      const nextPathRaw = params.get('next') || '/';
      const nextPath =
        typeof nextPathRaw === 'string' && nextPathRaw.startsWith('/')
          ? nextPathRaw
          : '/';

      navigate(nextPath, { replace: true });
    } catch (err) {
      setError(getLoginErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[#0F172A] relative overflow-hidden font-sans">
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-teal-500/10 rounded-full blur-[120px] animate-pulse" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-500/10 rounded-full blur-[120px] animate-pulse delay-700" />
      
      <div className="w-full max-w-[480px] relative">
        <div className="flex flex-col items-center mb-10 group">
          <div className="w-20 h-20 bg-teal-500 rounded-3xl flex items-center justify-center shadow-2xl shadow-teal-500/20 mb-6 transform group-hover:scale-110 transition-transform duration-500">
            <ShieldCheck className="text-white" size={40} strokeWidth={2.5} />
          </div>
          <h1 className="text-4xl font-black text-white tracking-tight mb-2">SINDH <span className="text-teal-400">ADMIN</span></h1>
          <p className="text-gray-400 font-medium tracking-wide">Enter your master credentials to enter</p>
        </div>

        <div className="bg-white/10 backdrop-blur-3xl border border-white/10 rounded-[32px] p-10 shadow-2xl overflow-hidden relative">
          <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />

          {error && (
            <div className="mb-8 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-3 text-red-400 text-sm font-bold animate-shake">
              <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0">⚠️</div>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6 relative">
            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-300 ml-1">ADMIN EMAIL</label>
              <div className="relative group">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-teal-400 transition-colors">
                  <Mail size={20} />
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500/50 transition-all font-medium"
                  placeholder="admin@example.com"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center px-1">
                <label className="text-sm font-bold text-gray-300">PASSWORD</label>
                <button type="button" className="text-xs font-bold text-gray-500 hover:text-teal-400 transition-colors">FORGOT?</button>
              </div>
              <div className="relative group">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-teal-400 transition-colors">
                  <Lock size={20} />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-12 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500/50 transition-all font-medium"
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-teal-400"
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2 px-1">
              <input
                type="checkbox"
                id="rememberMe"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 rounded border-white/10 bg-white/5 text-teal-500 focus:ring-offset-0 focus:ring-teal-500/50"
              />
              <label htmlFor="rememberMe" className="text-sm font-bold text-gray-400 cursor-pointer hover:text-gray-300 transition-colors">
                REMEMBER ME ON THIS DEVICE
              </label>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-teal-500 hover:bg-teal-400 disabled:bg-teal-800 text-[#0F172A] font-black py-4 rounded-2xl shadow-xl shadow-teal-500/20 active:scale-95 transition-all text-sm uppercase tracking-widest flex items-center justify-center gap-3 mt-4"
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin" size={20} />
                  <span>SYNCHRONIZING...</span>
                </>
              ) : (
                <>
                  <Lock size={18} />
                  <span>LOGIN TO CONSOLE</span>
                </>
              )}
            </button>
          </form>
        </div>

        <div className="mt-8 text-center text-gray-500 text-xs font-bold uppercase tracking-[0.2em]">
          &copy; 2025 SINDH PORTAL &bull; V1.0.5 &bull; SECURE CONSOLE
        </div>
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-4px); }
          75% { transform: translateX(4px); }
        }
        .animate-shake { animation: shake 0.4s ease-in-out; }
      `}</style>
    </div>
  );
}
