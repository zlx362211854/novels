import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { novelApi, architectureApi, chapterApi, exportApi } from '../services/api';

function NovelDetail() {
  const { id } = useParams();
  const [novel, setNovel] = useState(null);
  const [architectures, setArchitectures] = useState([]);
  const [chapters, setChapters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ title: '', description: '', genre: '' });

  useEffect(() => {
    loadData();
  }, [id]);

  const loadData = async () => {
    try {
      const [novelRes, archRes, chapterRes] = await Promise.all([
        novelApi.getById(id),
        architectureApi.getByNovelId(id),
        chapterApi.getByNovelId(id),
      ]);
      setNovel(novelRes.data);
      setArchitectures(archRes.data);
      setChapters(chapterRes.data);
      setEditForm({
        title: novelRes.data.title,
        description: novelRes.data.description || '',
        genre: novelRes.data.genre || '',
      });
    } catch (error) {
      console.error('加载数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    try {
      await novelApi.update(id, editForm);
      setNovel({ ...novel, ...editForm });
      setEditing(false);
    } catch (error) {
      console.error('更新失败:', error);
    }
  };

  const handleExport = async (scope) => {
    try {
      const res = await exportApi.exportNovel(id, scope);
      const blob = new Blob([res.data], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${novel.title}.md`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('导出失败:', error);
    }
  };

  if (loading) {
    return <div className="flex justify-center items-center h-64">加载中...</div>;
  }

  if (!novel) {
    return <div className="text-center py-12">小说不存在</div>;
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <Link to="/" className="text-blue-500 hover:underline">← 返回列表</Link>
      </div>

      {editing ? (
        <form onSubmit={handleUpdate} className="mb-6">
          <div className="mb-4">
            <input
              type="text"
              value={editForm.title}
              onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
              className="text-2xl font-bold w-full border-b-2 border-gray-300 focus:border-blue-500 outline-none pb-2"
              required
            />
          </div>
          <div className="mb-4">
            <textarea
              value={editForm.description}
              onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
              className="w-full border rounded px-3 py-2"
              rows={3}
              placeholder="小说简介"
            />
          </div>
          <div className="mb-4">
            <input
              type="text"
              value={editForm.genre}
              onChange={(e) => setEditForm({ ...editForm, genre: e.target.value })}
              className="border rounded px-3 py-2"
              placeholder="类型"
            />
          </div>
          <div className="flex gap-2">
            <button type="submit" className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">
              保存
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="border px-4 py-2 rounded hover:bg-gray-100"
            >
              取消
            </button>
          </div>
        </form>
      ) : (
        <div className="mb-6">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-2xl font-bold mb-2">{novel.title}</h1>
              {novel.description && (
                <p className="text-gray-600 mb-2">{novel.description}</p>
              )}
              {novel.genre && (
                <span className="inline-block bg-gray-100 text-gray-600 text-sm px-2 py-1 rounded">
                  {novel.genre}
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setEditing(true)}
                className="border px-3 py-1 rounded hover:bg-gray-100"
              >
                编辑
              </button>
              <button
                onClick={() => handleExport('full')}
                className="border px-3 py-1 rounded hover:bg-gray-100"
              >
                导出
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="border-b mb-6">
        <div className="flex gap-4">
          <button
            onClick={() => setActiveTab('overview')}
            className={`pb-2 px-2 ${activeTab === 'overview' ? 'border-b-2 border-blue-500 text-blue-500' : ''}`}
          >
            概览
          </button>
          <button
            onClick={() => setActiveTab('architecture')}
            className={`pb-2 px-2 ${activeTab === 'architecture' ? 'border-b-2 border-blue-500 text-blue-500' : ''}`}
          >
            架构管理
          </button>
          <button
            onClick={() => setActiveTab('chapters')}
            className={`pb-2 px-2 ${activeTab === 'chapters' ? 'border-b-2 border-blue-500 text-blue-500' : ''}`}
          >
            章节管理
          </button>
        </div>
      </div>

      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="border rounded-lg p-4">
            <h3 className="font-semibold mb-2">架构统计</h3>
            <p>全本架构: {architectures.filter(a => a.level === 'full').length}</p>
            <p>卷架构: {architectures.filter(a => a.level === 'volume').length}</p>
            <p>章架构: {architectures.filter(a => a.level === 'chapter').length}</p>
          </div>
          <div className="border rounded-lg p-4">
            <h3 className="font-semibold mb-2">章节统计</h3>
            <p>总章节数: {chapters.length}</p>
            <p>草稿: {chapters.filter(c => c.status === 'draft').length}</p>
            <p>已生成: {chapters.filter(c => c.status === 'generated').length}</p>
          </div>
        </div>
      )}

      {activeTab === 'architecture' && (
        <div>
          <Link
            to={`/novels/${id}/architecture`}
            className="inline-block bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 mb-4"
          >
            管理架构
          </Link>
          {architectures.length === 0 ? (
            <p className="text-gray-500">还没有创建架构</p>
          ) : (
            <div className="space-y-2">
              {architectures.map((arch) => (
                <div key={arch.id} className="border rounded p-3">
                  <span className="text-xs bg-gray-100 px-2 py-1 rounded mr-2">
                    {arch.level === 'full' ? '全本' : arch.level === 'volume' ? '卷' : '章'}
                  </span>
                  <span className="font-medium">{arch.title}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'chapters' && (
        <div>
          <Link
            to={`/novels/${id}/chapters`}
            className="inline-block bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 mb-4"
          >
            管理章节
          </Link>
          {chapters.length === 0 ? (
            <p className="text-gray-500">还没有创建章节</p>
          ) : (
            <div className="space-y-2">
              {chapters.map((chapter) => (
                <Link
                  key={chapter.id}
                  to={`/chapters/${chapter.id}`}
                  className="block border rounded p-3 hover:bg-gray-50"
                >
                  <span className="font-medium">第{chapter.chapter_number}章: {chapter.title || '未命名'}</span>
                  <span className={`ml-2 text-xs px-2 py-1 rounded ${
                    chapter.status === 'draft' ? 'bg-gray-100 text-gray-600' :
                    chapter.status === 'generated' ? 'bg-green-100 text-green-600' :
                    'bg-blue-100 text-blue-600'
                  }`}>
                    {chapter.status}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default NovelDetail;
