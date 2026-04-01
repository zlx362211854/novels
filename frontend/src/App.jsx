import { BrowserRouter as Router, Link, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import ArchitectureManager from './pages/ArchitectureManager';
import ChapterDetail from './pages/ChapterDetail';
import NovelDetail from './pages/NovelDetail';
import NovelList from './pages/NovelList';
import Settings from './pages/Settings';

function AppFrame() {
  const location = useLocation();
  const inSettings = location.pathname.startsWith('/settings');
  const atHome = location.pathname === '/';

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-[color:rgba(255,255,255,0.52)] bg-[linear-gradient(180deg,rgba(255,250,243,0.94),rgba(250,243,234,0.86))] backdrop-blur-xl">
        <div className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 rounded-[28px] border border-[color:rgba(216,203,184,0.72)] bg-[linear-gradient(135deg,rgba(255,252,247,0.92),rgba(246,237,224,0.82))] px-5 py-4 shadow-[0_12px_30px_rgba(38,28,18,0.06)] lg:flex-row lg:items-center lg:justify-between">
            <Link to="/" className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[color:rgba(139,101,55,0.22)] bg-slate-500 text-sm font-semibold text-white shadow-[0_14px_24px_rgba(38,28,18,0.2)]">
                AI
              </div>
              <div>
                <p className="text-[0.72rem] font-semibold uppercase tracking-[0.34em] text-[color:var(--ink-muted)]">
                  Writers Room
                </p>
                <p className="mt-1 text-[1.02rem] font-semibold tracking-[-0.02em] text-[color:var(--ink)]">
                  AI 长篇小说创作工具
                </p>
              </div>
            </Link>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="hidden items-center gap-2 rounded-full border border-[color:rgba(216,203,184,0.72)] bg-[color:rgba(255,252,247,0.8)] px-3 py-2 text-xs text-[color:var(--ink-muted)] lg:flex">
                <span className="h-2 w-2 rounded-full bg-[color:var(--accent)]" />
                <span>{atHome ? 'Project index open' : inSettings ? 'Workspace settings' : 'Manuscript workspace'}</span>
              </div>
              <nav className="flex items-center gap-2 rounded-full border border-[color:rgba(216,203,184,0.72)] bg-[color:rgba(255,252,247,0.84)] p-1">
                <NavLink
                  to="/"
                  end
                  className={({ isActive }) =>
                    `rounded-full px-4 py-2 text-sm font-medium transition ${isActive
                      ? 'bg-slate-500 text-white shadow-[0_10px_22px_rgba(38,28,18,0.18)]'
                      : 'text-[color:var(--ink-muted)] hover:bg-[color:rgba(139,101,55,0.08)] hover:text-[color:var(--ink)]'
                    }`
                  }
                >
                  小说工作台
                </NavLink>
                <NavLink
                  to="/settings"
                  className={({ isActive }) =>
                    `rounded-full px-4 py-2 text-sm font-medium transition ${isActive
                      ? 'bg-slate-500 text-white shadow-[0_10px_22px_rgba(38,28,18,0.18)]'
                      : 'text-[color:var(--ink-muted)] hover:bg-[color:rgba(139,101,55,0.08)] hover:text-[color:var(--ink)]'
                    }`
                  }
                >
                  系统设置
                </NavLink>
              </nav>
            </div>
          </div>
        </div>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<NovelList />} />
          <Route path="/novels/:id" element={<NovelDetail />} />
          <Route path="/novels/:id/architecture" element={<ArchitectureManager />} />
          <Route path="/chapters/:id" element={<ChapterDetail />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  );
}

function App() {
  return (
    <Router>
      <AppFrame />
    </Router>
  );
}

export default App;
