import { NavLink } from 'react-router-dom';

const links = [
  { to: '/', label: 'Schedule' },
  { to: '/employees', label: 'Employees' },
  { to: '/stations', label: 'Stations' },
  { to: '/help', label: 'Help & Guide' },
];

export default function Sidebar() {
  return (
    <aside className="w-56 bg-gray-900 text-white min-h-screen p-4 flex flex-col gap-1">
      <h1 className="text-lg font-bold mb-6 px-3">Shift Scheduler</h1>
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
    </aside>
  );
}
