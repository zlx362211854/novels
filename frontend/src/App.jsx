import { BrowserRouter as Router, Link, NavLink, Route, Routes } from 'react-router-dom';
import { cn } from '@/lib/utils';
import ArchitectureManager from './pages/ArchitectureManager';
import ChapterDetail from './pages/ChapterDetail';
import ChapterManager from './pages/ChapterManager';
import MultiChapterReview from './pages/MultiChapterReview';
import NovelDetail from './pages/NovelDetail';
import NovelList from './pages/NovelList';
import Settings from './pages/Settings';
import StoryBibleManager from './pages/StoryBibleManager';
import { BookOpen, Settings as SettingsIcon } from 'lucide-react';

function AppFrame() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <BookOpen className="h-4 w-4" />
            </div>
            <span className="font-semibold">AI创作工具</span>
          </Link>

          <nav className="flex items-center gap-1">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                cn(
                  'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
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
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )
              }
            >
              <SettingsIcon className="h-3.5 w-3.5" />
              系统设置
            </NavLink>
          </nav>
        </div>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<NovelList />} />
          <Route path="/novels/:id" element={<NovelDetail />} />
          <Route path="/novels/:id/story-bible" element={<StoryBibleManager />} />
          <Route path="/novels/:id/architecture" element={<ArchitectureManager />} />
          <Route path="/novels/:id/chapters" element={<ChapterManager />} />
          <Route path="/chapters/:id" element={<ChapterDetail />} />
          <Route path="/novels/:novelId/multi-chapter-review/:reviewId" element={<MultiChapterReview />} />
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
