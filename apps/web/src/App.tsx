import { useEffect } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Activity, Dumbbell, Home, LineChart, Salad, User } from 'lucide-react';
import { useApi } from './lib/hooks';
import { Loading } from './components/ui';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Treinos } from './pages/Treinos';
import { WorkoutSession } from './pages/WorkoutSession';
import { Dieta } from './pages/Dieta';
import { Evolucao } from './pages/Evolucao';
import { Performance } from './pages/Performance';
import { Perfil } from './pages/Perfil';

const NAV = [
  { to: '/', label: 'Hoje', icon: Home, end: true },
  { to: '/treinos', label: 'Treinos', icon: Dumbbell },
  { to: '/dieta', label: 'Dieta', icon: Salad },
  { to: '/evolucao', label: 'Evolução', icon: LineChart },
  { to: '/performance', label: 'Performance', icon: Activity },
];

export function App() {
  const qc = useQueryClient();
  const me = useApi<{ user: any }>('/api/auth/me', { retry: false, staleTime: 60_000 });

  useEffect(() => {
    const h = () => qc.setQueryData(['/api/auth/me'], null);
    window.addEventListener('pp:unauthorized', h);
    return () => window.removeEventListener('pp:unauthorized', h);
  }, [qc]);

  if (me.isLoading) return <Loading />;
  if (!me.data?.user) return <Login />;

  return (
    <div className="app">
      <nav className="side-nav" aria-label="Principal">
        <div className="brand">Performance</div>
        {[...NAV, { to: '/perfil', label: 'Perfil', icon: User }].map((n) => (
          <NavLink key={n.to} to={n.to} end={'end' in n ? n.end : false}>
            <n.icon size={18} /> {n.label}
          </NavLink>
        ))}
      </nav>
      <main className="main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/treinos" element={<Treinos />} />
          <Route path="/treinos/:id" element={<WorkoutSession />} />
          <Route path="/dieta" element={<Dieta />} />
          <Route path="/evolucao" element={<Evolucao />} />
          <Route path="/performance" element={<Performance />} />
          <Route path="/perfil" element={<Perfil />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <nav className="bottom-nav" aria-label="Principal">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end}>
            <n.icon size={22} strokeWidth={2} />
            {n.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
