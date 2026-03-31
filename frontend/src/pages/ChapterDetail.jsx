import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { chapterApi } from '../services/api';

function ChapterDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [chapter, setChapter] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  useEffect(() => {
    loadChapter();
  }, [id]);

  const loadChapter = async () => {
    try {
      const res = await chapterApi.getById(id);
      setChapter(res.data);
      setEditContent(res.data.content || '');
      setEditTitle(res.data.title || '');
    } catch (error) {
      console.error('加载章节失败:', error);
      alert('加载章节失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!editContent.trim()) {
      alert('内容不能为空');
      return;
    }
    setSaving(true);
    try {
      await chapterApi.update(id, {
        title: editTitle,
        content: editContent,
      });
      setChapter({
        ...chapter,
        title: editTitle,
        content: editContent,
      });
      setIsEditing(false);
    } catch (error) {
      console.error('保存失败:', error);
      alert('保存失败: ' + (error.response?.data?.error || error.message));
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditContent(chapter.content || '');
    setEditTitle(chapter.title || '');
    setIsEditing(false);
  };

  const handleRegenerate = async () => {
    if (!confirm('确定要重新生成章节内容吗？当前内容将被覆盖。')) return;

    setRegenerating(true);
    try {
      const res = await chapterApi.regenerate(id);
      setChapter(res.data);
      setEditContent(res.data.content || '');
      alert('章节已重新生成');
    } catch (error) {
      console.error('重新生成失败:', error);
      alert('重新生成失败: ' + (error.response?.data?.error || error.message));
    } finally {
      setRegenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!chapter.content) {
      alert('没有内容可复制');
      return;
    }
    try {
      await navigator.clipboard.writeText(chapter.content);
      alert('已复制到剪贴板');
    } catch (error) {
      console.error('复制失败:', error);
      alert('复制失败');
    }
  };

  if (loading) {
    return <div className="flex justify-center items-center h-64">加载中...</div>;
  }

  if (!chapter) {
    return <div className="flex justify-center items-center h-64">章节不存在</div>;
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-6">
        <button
          onClick={() => navigate(-1)}
          className="text-blue-500 hover:underline"
        >
          ← 返回
        </button>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-start mb-6">
          <div>
            {isEditing ? (
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="text-2xl font-bold border rounded px-3 py-2 w-full"
                placeholder="章节标题"
              />
            ) : (
              <h1 className="text-2xl font-bold">{chapter.title}</h1>
            )}
            <div className="text-sm text-gray-500 mt-2">
              字数：{chapter.content?.length || 0} 字
            </div>
          </div>
          <div className="flex gap-2">
            {isEditing ? (
              <>
                <button
                  onClick={handleCancel}
                  className="px-4 py-2 border rounded hover:bg-gray-100"
                  disabled={saving}
                >
                  取消
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
                >
                  {saving ? '保存中...' : '保存'}
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={handleCopy}
                  className="px-4 py-2 border rounded hover:bg-gray-100"
                >
                  复制正文
                </button>
                {chapter.architecture_id && (
                  <button
                    onClick={handleRegenerate}
                    disabled={regenerating}
                    className="px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600 disabled:opacity-50"
                  >
                    {regenerating ? '生成中...' : '重新生成'}
                  </button>
                )}
                <button
                  onClick={() => setIsEditing(true)}
                  className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                >
                  手动修改
                </button>
              </>
            )}
          </div>
        </div>

        <div className="border-t pt-6">
          {isEditing ? (
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="w-full border rounded p-4 min-h-[60vh] resize-y font-mono text-sm"
              placeholder="章节内容（支持Markdown格式）"
            />
          ) : (
            <div className="prose prose-lg max-w-none">
              <ReactMarkdown>
                {chapter.content || '暂无内容'}
              </ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ChapterDetail;
