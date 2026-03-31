import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import NovelList from './pages/NovelList';
import NovelDetail from './pages/NovelDetail';
import ArchitectureManager from './pages/ArchitectureManager';
import ChapterManager from './pages/ChapterManager';
import ChapterEditor from './pages/ChapterEditor';
import ChapterDetail from './pages/ChapterDetail';
import Settings from './pages/Settings';

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-gray-50">
        <nav className="bg-white shadow-sm border-b">
          <div className="container mx-auto px-4 py-3 flex justify-between items-center">
            <Link to="/" className="text-xl font-bold text-gray-800">
              AI长篇小说创作工具
            </Link>
            <Link to="/settings" className="text-gray-600 hover:text-gray-800">
              设置
            </Link>
          </div>
        </nav>
        <main>
          <Routes>
            <Route path="/" element={<NovelList />} />
            <Route path="/novels/:id" element={<NovelDetail />} />
            <Route path="/novels/:id/architecture" element={<ArchitectureManager />} />
            <Route path="/novels/:id/chapters" element={<ChapterManager />} />
            <Route path="/chapters/:id" element={<ChapterEditor />} />
            <Route path="/chapter/:id" element={<ChapterDetail />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
