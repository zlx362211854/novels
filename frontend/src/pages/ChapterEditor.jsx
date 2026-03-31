import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { chapterApi, templateApi } from '../services/api';

function ChapterEditor() {
  const { id } = useParams();
  const [chapter, setChapter] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState('');
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [review, setReview] = useState(null);
  const [showVersions, setShowVersions] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(null);

  useEffect(() => {
    loadData();
  }, [id]);

  const loadData = async () => {
    try {
      const [chapterRes, templateRes, versionRes] = await Promise.all([
        chapterApi.getById(id),
        templateApi.getAll(),
        chapterApi.getVersions(id),
      ]);
      setChapter(chapterRes.data);
      setContent(chapterRes.data.content || '');
      setTitle(chapterRes.data.title || '');
      setTemplates(templateRes.data);
      setVersions(versionRes.data);
      const defaultTemplate = templateRes.data.find(t => t.is_default);
      if (defaultTemplate) setSelectedTemplate(defaultTemplate.id);
    } catch (error) {
      console.error('加载数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await chapterApi.update(id, { title, content });
      const versionRes = await chapterApi.getVersions(id);
      setVersions(versionRes.data);
      alert('保存成功');
    } catch (error) {
      console.error('保存失败:', error);
      alert('保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleGenerate = async () => {
    if (!confirm('生成将覆盖当前内容，确定继续吗？')) return;
    setGenerating(true);
    setReview(null);
    try {
      const res = await chapterApi.generate(id, selectedTemplate);
      setContent(res.data.chapter.content);
      setTitle(res.data.chapter.title);
      setReview(res.data.review);
      const versionRes = await chapterApi.getVersions(id);
      setVersions(versionRes.data);
    } catch (error) {
      console.error('生成失败:', error);
      alert('生成失败: ' + error.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleRestore = async (versionNumber) => {
    if (!confirm('确定恢复到此版本吗？')) return;
    try {
      const res = await chapterApi.restoreVersion(id, versionNumber);
      setContent(res.data.content);
      alert('恢复成功');
      setShowVersions(false);
    } catch (error) {
      console.error('恢复失败:', error);
      alert('恢复失败');
    }
  };

  if (loading) {
    return <div className="flex justify-center items-center h-64">加载中...</div>;
  }

  if (!chapter) {
    return <div className="text-center py-12">章节不存在</div>;
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <Link to={`/novels/${chapter.novel_id}/chapters`} className="text-blue-500 hover:underline">← 返回章节列表</Link>
      </div>

      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">第{chapter.chapter_number}章编辑</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setShowVersions(!showVersions)}
            className="border px-4 py-2 rounded hover:bg-gray-100"
          >
            版本历史 ({versions.length})
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 disabled:opacity-50"
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>

      {showVersions && (
        <div className="mb-6 border rounded-lg p-4 max-h-60 overflow-y-auto">
          <h3 className="font-semibold mb-2">版本历史</h3>
          {versions.length === 0 ? (
            <p className="text-gray-500 text-sm">暂无历史版本</p>
          ) : (
            <div className="space-y-2">
              {versions.map(v => (
                <div key={v.id} className="flex justify-between items-center text-sm border-b pb-2">
                  <span>版本 {v.version_number} - {new Date(v.created_at).toLocaleString()}</span>
                  <button
                    onClick={() => handleRestore(v.version_number)}
                    className="text-blue-500 hover:underline"
                  >
                    恢复
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mb-4">
        <label className="block text-sm font-medium mb-1">章节标题</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full border rounded px-3 py-2"
        />
      </div>

      <div className="mb-4 flex gap-4 items-end">
        <div className="flex-1">
          <label className="block text-sm font-medium mb-1">提示词模板</label>
          <select
            value={selectedTemplate || ''}
            onChange={(e) => setSelectedTemplate(e.target.value ? parseInt(e.target.value) : null)}
            className="w-full border rounded px-3 py-2"
          >
            {templates.map(t => (
              <option key={t.id} value={t.id}>{t.name} {t.is_default ? '(默认)' : ''}</option>
            ))}
          </select>
        </div>
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="bg-purple-500 text-white px-6 py-2 rounded hover:bg-purple-600 disabled:opacity-50"
        >
          {generating ? '生成中...' : 'AI生成'}
        </button>
      </div>

      {review && (
        <div className={`mb-4 p-4 rounded-lg ${review.score >= 70 ? 'bg-green-50 border border-green-200' : 'bg-yellow-50 border border-yellow-200'}`}>
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-semibold">审核报告</h3>
            <span className={`text-lg font-bold ${review.score >= 70 ? 'text-green-600' : 'text-yellow-600'}`}>
              评分: {review.score}
            </span>
          </div>
          {review.issues && review.issues.length > 0 && (
            <div className="space-y-2">
              {review.issues.map((issue, idx) => (
                <div key={idx} className="text-sm">
                  <span className="font-medium text-red-600">{issue.type}: </span>
                  <span>{issue.description}</span>
                  {issue.suggestion && <span className="text-gray-500"> - 建议: {issue.suggestion}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">编辑</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full border rounded px-3 py-2 font-mono text-sm"
            rows={25}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">预览</label>
          <div className="border rounded px-4 py-2 min-h-[500px] overflow-y-auto prose prose-sm max-w-none">
            <ReactMarkdown>{content}</ReactMarkdown>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ChapterEditor;
