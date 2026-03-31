import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { novelApi } from '../services/api';

function NovelList() {
  const [novels, setNovels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newNovel, setNewNovel] = useState({ title: '', description: '', genre: '' });

  useEffect(() => {
    loadNovels();
  }, []);

  const loadNovels = async () => {
    try {
      const res = await novelApi.getAll();
      setNovels(res.data);
    } catch (error) {
      console.error('加载小说列表失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newNovel.title.trim()) return;
    try {
      await novelApi.create(newNovel);
      setNewNovel({ title: '', description: '', genre: '' });
      setShowCreate(false);
      loadNovels();
    } catch (error) {
      console.error('创建小说失败:', error);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('确定要删除这部小说吗？所有相关数据将被删除。')) return;
    try {
      await novelApi.delete(id);
      loadNovels();
    } catch (error) {
      console.error('删除小说失败:', error);
    }
  };

  if (loading) {
    return <div className="flex justify-center items-center h-64">加载中...</div>;
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">我的小说</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
        >
          创建新小说
        </button>
      </div>

      {showCreate && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">创建新小说</h2>
            <form onSubmit={handleCreate}>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">标题 *</label>
                <input
                  type="text"
                  value={newNovel.title}
                  onChange={(e) => setNewNovel({ ...newNovel, title: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                  required
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">简介</label>
                <textarea
                  value={newNovel.description}
                  onChange={(e) => setNewNovel({ ...newNovel, description: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                  rows={3}
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">类型</label>
                <input
                  type="text"
                  value={newNovel.genre}
                  onChange={(e) => setNewNovel({ ...newNovel, genre: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                  placeholder="如：玄幻、都市、科幻"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="px-4 py-2 border rounded hover:bg-gray-100"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                >
                  创建
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {novels.length === 0 ? (
        <div className="text-center text-gray-500 py-12">
          还没有创建任何小说，点击上方按钮开始创作
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {novels.map((novel) => (
            <div key={novel.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
              <Link to={`/novels/${novel.id}`}>
                <h3 className="text-lg font-semibold mb-2 hover:text-blue-500">{novel.title}</h3>
              </Link>
              {novel.description && (
                <p className="text-gray-600 text-sm mb-2 line-clamp-2">{novel.description}</p>
              )}
              {novel.genre && (
                <span className="inline-block bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded mb-2">
                  {novel.genre}
                </span>
              )}
              <div className="flex justify-between items-center mt-3 text-sm text-gray-500">
                <span>更新于 {new Date(novel.updated_at).toLocaleDateString()}</span>
                <button
                  onClick={() => handleDelete(novel.id)}
                  className="text-red-500 hover:text-red-600"
                >
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default NovelList;
