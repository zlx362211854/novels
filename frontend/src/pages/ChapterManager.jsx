import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { chapterApi, architectureApi } from '../services/api';

function ChapterManager() {
  const { id } = useParams();
  const [chapters, setChapters] = useState([]);
  const [architectures, setArchitectures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newChapter, setNewChapter] = useState({
    chapterNumber: 1,
    title: '',
    architectureId: null,
  });

  useEffect(() => {
    loadData();
  }, [id]);

  const loadData = async () => {
    try {
      const [chapterRes, archRes] = await Promise.all([
        chapterApi.getByNovelId(id),
        architectureApi.getByNovelId(id),
      ]);
      setChapters(chapterRes.data);
      setArchitectures(archRes.data);
      setNewChapter(prev => ({
        ...prev,
        chapterNumber: chapterRes.data.length + 1,
      }));
    } catch (error) {
      console.error('加载数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await chapterApi.create(id, {
        chapterNumber: newChapter.chapterNumber,
        title: newChapter.title,
        architectureId: newChapter.architectureId,
        status: 'draft',
      });
      setNewChapter({
        chapterNumber: chapters.length + 2,
        title: '',
        architectureId: null,
      });
      setShowCreate(false);
      loadData();
    } catch (error) {
      console.error('创建章节失败:', error);
    }
  };

  const handleDelete = async (chapterId) => {
    if (!confirm('确定要删除这个章节吗？')) return;
    try {
      await chapterApi.delete(chapterId);
      loadData();
    } catch (error) {
      console.error('删除章节失败:', error);
    }
  };

  const chapterArchs = architectures.filter(a => a.level === 'chapter');

  if (loading) {
    return <div className="flex justify-center items-center h-64">加载中...</div>;
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <Link to={`/novels/${id}`} className="text-blue-500 hover:underline">← 返回小说详情</Link>
      </div>

      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">章节管理</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
        >
          创建章节
        </button>
      </div>

      {showCreate && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">创建新章节</h2>
            <form onSubmit={handleCreate}>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">章节序号 *</label>
                <input
                  type="number"
                  value={newChapter.chapterNumber}
                  onChange={(e) => setNewChapter({ ...newChapter, chapterNumber: parseInt(e.target.value) })}
                  className="w-full border rounded px-3 py-2"
                  min="1"
                  required
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">章节标题</label>
                <input
                  type="text"
                  value={newChapter.title}
                  onChange={(e) => setNewChapter({ ...newChapter, title: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">关联架构</label>
                <select
                  value={newChapter.architectureId || ''}
                  onChange={(e) => setNewChapter({ ...newChapter, architectureId: e.target.value ? parseInt(e.target.value) : null })}
                  className="w-full border rounded px-3 py-2"
                >
                  <option value="">无</option>
                  {chapterArchs.map(arch => (
                    <option key={arch.id} value={arch.id}>{arch.title}</option>
                  ))}
                </select>
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

      {chapters.length === 0 ? (
        <p className="text-center text-gray-500 py-12">还没有创建任何章节</p>
      ) : (
        <div className="space-y-2">
          {chapters.map((chapter) => (
            <div key={chapter.id} className="border rounded-lg p-4 flex justify-between items-center">
              <Link to={`/chapters/${chapter.id}`} className="flex-1 hover:text-blue-500">
                <span className="font-medium">第{chapter.chapter_number}章: {chapter.title || '未命名'}</span>
                <span className={`ml-3 text-xs px-2 py-1 rounded ${
                  chapter.status === 'draft' ? 'bg-gray-100 text-gray-600' :
                  chapter.status === 'generated' ? 'bg-green-100 text-green-600' :
                  'bg-blue-100 text-blue-600'
                }`}>
                  {chapter.status === 'draft' ? '草稿' : chapter.status === 'generated' ? '已生成' : chapter.status}
                </span>
              </Link>
              <button
                onClick={() => handleDelete(chapter.id)}
                className="text-red-500 hover:text-red-600 ml-4"
              >
                删除
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default ChapterManager;
