import { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { CalendarDaysIcon, HouseIcon, RefrigeratorIcon, ShoppingCartIcon, UsersIcon } from 'lucide-react';
import { api, CHANGED } from './api';
import { Onboarding } from './screens/Onboarding';
import { Ask } from './screens/Ask';
import { RecipeScreen } from './screens/Recipe';
import { BasketScreen } from './screens/Basket';
import { InventoryScreen } from './screens/Inventory';
import { HouseholdScreen } from './screens/Household';
import { WeekScreen } from './screens/Week';
import { ChatSheet } from './ChatSheet';

const tabs = [
  { to: '/', label: 'Ask', Icon: HouseIcon },
  { to: '/week', label: 'Week', Icon: CalendarDaysIcon },
  { to: '/basket', label: 'Basket', Icon: ShoppingCartIcon },
  { to: '/stock', label: 'Stock', Icon: RefrigeratorIcon },
  { to: '/household', label: 'Household', Icon: UsersIcon },
];

export function App() {
  const loc = useLocation();
  const [onboarded, setOnboarded] = useState<boolean | null>(null);
  useEffect(() => {
    const load = () => api.state().then(s => setOnboarded(s.onboarded)).catch(() => setOnboarded(true));
    load();
    window.addEventListener(CHANGED, load);
    return () => window.removeEventListener(CHANGED, load);
  }, []);

  if (onboarded === null) return null;
  const welcome = loc.pathname.startsWith('/welcome');
  if (!onboarded && !welcome) return <Navigate to="/welcome" replace />;

  return (
    <div className="h-full flex flex-col max-w-[480px] mx-auto">
      <main className="flex-1 overflow-y-auto px-4 pb-4">
        <Routes>
          <Route path="/welcome" element={<Onboarding />} />
          <Route path="/" element={<Ask />} />
          <Route path="/week" element={<WeekScreen />} />
          <Route path="/recipe/:id" element={<RecipeScreen />} />
          <Route path="/basket" element={<BasketScreen />} />
          <Route path="/basket/:id" element={<BasketScreen />} />
          <Route path="/stock" element={<InventoryScreen />} />
          <Route path="/household" element={<HouseholdScreen />} />
        </Routes>
      </main>
      <ChatSheet />
      {!welcome && (
        <nav className="grid grid-cols-5 border-t border-border bg-card pb-[env(safe-area-inset-bottom)]">
          {tabs.map(t => (
            <NavLink key={t.to} to={t.to} end={t.to === '/'} className={({ isActive }) => `flex flex-col items-center justify-center gap-1 h-16 text-[11px] font-bold ${isActive ? 'text-primary font-extrabold' : 'text-muted-foreground'}`}>
              <t.Icon className="size-[22px]" strokeWidth={2} />
              <span>{t.label}</span>
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  );
}
