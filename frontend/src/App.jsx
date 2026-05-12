import { BrowserRouter as Router, Link, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import ArchitectureManager from './pages/ArchitectureManager';
import ChapterDetail from './pages/ChapterDetail';
import ChapterManager from './pages/ChapterManager';
import MultiChapterReview from './pages/MultiChapterReview';
import NovelBootstrap from './pages/NovelBootstrap';
import NovelDetail from './pages/NovelDetail';
import NovelList from './pages/NovelList';
import Settings from './pages/Settings';
import StoryBibleManager from './pages/StoryBibleManager';
import Login from './pages/Login';
import { useAuth } from './components/AuthProvider';
import { BookOpen, LogOut, Settings as SettingsIcon } from 'lucide-react';
import { Button } from './components/ui/button';

function ProtectedRoute({ children }) {
  const auth = useAuth();
  const location = useLocation();

  if (auth?.status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        正在验证登录状态...
      </div>
    );
  }

  if (!auth?.isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return children;
}

function AppFrame() {
  const auth = useAuth();
  const location = useLocation();

  if (location.pathname === '/login') {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
      </Routes>
    );
  }

  return (
    <div className="app-stage">
      <header className="app-chrome sticky top-0 z-40 border-b border-border/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex items-center gap-2">
            <div className="brand-mark flex h-8 w-8 items-center justify-center rounded-md text-primary-foreground">
              <BookOpen className="h-4 w-4" />
            </div>
            <span className="font-semibold text-foreground">AI创作工具</span>
          </Link>

          <nav className="flex items-center gap-1">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                cn(
                  'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/20'
                    : 'text-muted-foreground hover:bg-accent/70 hover:text-accent-foreground'
                )
              }
            >
              工作台
            </NavLink>
            <NavLink
              to="/settings"
              className={({ isActive }) =>
                cn(
                  'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/20'
                    : 'text-muted-foreground hover:bg-accent/70 hover:text-accent-foreground'
                )
              }
            >
              <SettingsIcon className="h-3.5 w-3.5" />
              系统设置
            </NavLink>
            <Button variant="ghost" size="sm" onClick={() => auth.logout()}>
              <LogOut className="mr-1.5 h-3.5 w-3.5" />
              退出
            </Button>
          </nav>
        </div>
      </header>
      <main>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<ProtectedRoute><NovelList /></ProtectedRoute>} />
          <Route path="/novels/bootstrap" element={<ProtectedRoute><NovelBootstrap /></ProtectedRoute>} />
          <Route path="/novels/:id" element={<ProtectedRoute><NovelDetail /></ProtectedRoute>} />
          <Route path="/novels/:id/story-bible" element={<ProtectedRoute><StoryBibleManager /></ProtectedRoute>} />
          <Route path="/novels/:id/architecture" element={<ProtectedRoute><ArchitectureManager /></ProtectedRoute>} />
          <Route path="/novels/:id/chapters" element={<ProtectedRoute><ChapterManager /></ProtectedRoute>} />
          <Route path="/chapters/:id" element={<ProtectedRoute><ChapterDetail /></ProtectedRoute>} />
          <Route path="/novels/:novelId/multi-chapter-review/:reviewId" element={<ProtectedRoute><MultiChapterReview /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
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
