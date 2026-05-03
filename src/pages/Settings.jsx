import { useState } from 'react';

const settingGroups = [
  {
    title: 'Notifications',
    items: [
      { label: 'New User Alerts', desc: 'Get notified when a new user registers', default: true },
      { label: 'New Applications', desc: 'Alert on incoming applications', default: true },
      { label: 'System Updates', desc: 'Receive maintenance and release alerts', default: false },
    ],
  },
  {
    title: 'Security',
    items: [
      { label: 'Two-Factor Auth', desc: 'Enable two-step verification for admin login', default: false },
      { label: 'Session Timeout', desc: 'Auto logout after inactivity', default: true },
      { label: 'Login Alerts', desc: 'Get email alerts for new admin logins', default: true },
    ],
  },
  {
    title: 'Display',
    items: [
      { label: 'Dark Mode', desc: 'Use dark surfaces in dashboard', default: false },
      { label: 'Compact View', desc: 'Reduce spacing in lists and tables', default: false },
      { label: 'Show Animations', desc: 'Enable subtle interface animations', default: true },
    ],
  },
  {
    title: 'Data',
    items: [
      { label: 'Auto Refresh', desc: 'Refresh dashboard data every 5 minutes', default: false },
      { label: 'Show Inactive', desc: 'Show inactive records in data lists', default: false },
    ],
  },
];

function Toggle({ defaultOn }) {
  const [on, setOn] = useState(defaultOn);
  return <div className={`toggle ${on ? 'on' : ''}`} onClick={() => setOn(!on)} />;
}

export default function Settings() {
  return (
    <div>
      <div className="settings-grid">
        {settingGroups.map((group) => (
          <div className="settings-card" key={group.title}>
            <h3>{group.title}</h3>
            {group.items.map((item) => (
              <div className="settings-row" key={item.label}>
                <div className="settings-row-label">
                  <h4>{item.label}</h4>
                  <p>{item.desc}</p>
                </div>
                <Toggle defaultOn={item.default} />
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="settings-card" style={{ marginTop: 16 }}>
        <h3>Admin Credentials</h3>
        <div style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.8 }}>
          <p>
            To change admin email or password, edit the <code>.env</code> file in the backend folder:
          </p>
          <pre
            style={{
              background: '#0f172a',
              color: '#e2e8f0',
              padding: '14px',
              borderRadius: 10,
              marginTop: 12,
              border: '1px solid var(--border)',
              fontFamily: 'monospace',
              fontSize: 13,
            }}
          >
{`ADMIN_EMAIL=admin@university.com
ADMIN_PASSWORD=admin123
JWT_SECRET=your_secret_key`}
          </pre>
          <p style={{ marginTop: 12, color: 'var(--warning)' }}>
            Restart the backend server after saving changes.
          </p>
        </div>
      </div>
    </div>
  );
}
