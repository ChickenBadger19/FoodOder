import { NavLink, Route, Routes } from 'react-router-dom';
import { Ask } from './screens/Ask';
import { RecipeScreen } from './screens/Recipe';
import { BasketScreen } from './screens/Basket';
import { InventoryScreen } from './screens/Inventory';
import { HouseholdScreen } from './screens/Household';

const tabs = [
  { to: '/', label: 'Ask', icon: <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" /> },
  { to: '/basket', label: 'Basket', icon: <><path d="M3 5h2l2 12h11l2-8H6" /><circle cx="9" cy="20" r="1.5" /><circle cx="17" cy="20" r="1.5" /></> },
  { to: '/stock', label: 'Stock', icon: <><path d="M4 7h16v13H4z" /><path d="M4 7l2-3h12l2 3M9 11h6" /></> },
  { to: '/household', label: 'Household', icon: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></> },
];

export function App() {
  return (
    <div className="h-full flex flex-col max-w-[480px] mx-auto">
      <main className="flex-1 overflow-y-auto px-4 pb-4">
        <Routes>
          <Route path="/" element={<Ask />} />
          <Route path="/recipe/:id" element={<RecipeScreen />} />
          <Route path="/basket" element={<BasketScreen />} />
          <Route path="/basket/:id" element={<BasketScreen />} />
          <Route path="/stock" element={<InventoryScreen />} />
          <Route path="/household" element={<HouseholdScreen />} />
        </Routes>
      </main>
      <nav className="grid grid-cols-4 border-t-[1.5px] border-line bg-white pb-[env(safe-area-inset-bottom)]">
        {tabs.map(t => (
          <NavLink key={t.to} to={t.to} end={t.to === '/'} className={({ isActive }) => `flex flex-col items-center justify-center gap-1 h-16 text-[11px] font-bold ${isActive ? 'text-green font-extrabold' : 'text-muted'}`}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{t.icon}</svg>
            <span>{t.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
