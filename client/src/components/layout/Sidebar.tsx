import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import toast from 'react-hot-toast';

const links = [
  { to: '/', label: 'Schedule' },
  { to: '/employees', label: 'Employees' },
  { to: '/stations', label: 'Stations' },
  { to: '/help', label: 'Help & Guide' },
];

export default function Sidebar() {
  const [confirming, setConfirming] = useState(false);
  const [resetting, setResetting] = useState(false);

  const handleReset = async () => {
    setResetting(true);
    try {
      const res = await fetch('/api/reset-seed', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success('Database reset. Restarting...');
      setTimeout(() => window.location.reload(), 1500);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setResetting(false);
      setConfirming(false);
    }
  };

  return (
    <aside className="w-56 bg-gray-900 text-white min-h-screen p-4 flex flex-col">
      <h1 className="text-lg font-bold mb-6 px-3">Shift Scheduler</h1>
      <div className="flex flex-col gap-1 flex-1">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end
            className={({ isActive }) =>
              `block px-3 py-2 rounded text-sm ${
                isActive ? 'bg-gray-700 text-white font-medium' : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`
            }
          >
            {link.label}
          </NavLink>
        ))}
      </div>
      <div className="border-t border-gray-700 pt-3 mt-3">
        {!confirming ? (
          <button
            onClick={() => setConfirming(true)}
            className="block w-full text-left px-3 py-2 rounded text-sm text-gray-500 hover:text-red-400 hover:bg-gray-800 transition-colors"
          >
            Reset to Default Data
          </button>
        ) : (
          <div className="px-3 py-2 space-y-2">
            <p className="text-xs text-red-400">This will replace all data with the default employees and settings. You will lose any changes.</p>
            <div className="flex gap-2">
              <button
                onClick={handleReset}
                disabled={resetting}
                className="px-3 py-1 bg-red-600 text-white rounded text-xs font-medium hover:bg-red-700 disabled:opacity-50"
              >
                {resetting ? 'Resetting...' : 'Confirm'}
              </button>
              <button
                onClick={() => setConfirming(false)}
                className="px-3 py-1 bg-gray-700 rounded text-xs text-gray-300 hover:bg-gray-600"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
