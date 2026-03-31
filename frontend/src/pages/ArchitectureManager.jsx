import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { architectureApi, chapterApi } from '../services/api';

function ArchitectureManager() {
  const { id } = useParams();
  const [architectures, setArchitectures] = useState([]);
  const [chapters, setChapters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [showChapterBatch, setShowChapterBatch] = useState(false);
  const [selectedVolumeId, setSelectedVolumeId] = useState('');
  const [generatedChapters, setGeneratedChapters] = useState([]);
  const [batchGenerating, setBatchGenerating] = useState(false);
  const [generatingContent, setGeneratingContent] = useState(null);
  const [batchGeneratingContent, setBatchGeneratingContent] = useState(false);
  const [showContentPreview, setShowContentPreview] = useState(false);
  const [previewContent, setPreviewContent] = useState('');
  const [previewTitle, setPreviewTitle] = useState('');
  const [previewArchId, setPreviewArchId] = useState(null);
  const [formData, setFormData] = useState({
    level: 'full',
    parentId: null,
    title: '',
    plotOutline: '',
    characters: '',
    worldSetting: '',
    emotionalTone: '',
  });

  useEffect(() => {
    loadData();
  }, [id]);

  const loadData = async () => {
    try {
      const [archRes, chapterRes] = await Promise.all([
        architectureApi.getByNovelId(id),
        chapterApi.getByNovelId(id)
      ]);
      setArchitectures(archRes.data);
      setChapters(chapterRes.data);
    } catch (error) {
      console.error('加载数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      level: 'full',
      parentId: null,
      title: '',
      plotOutline: '',
      characters: '',
      worldSetting: '',
      emotionalTone: '',
    });
  };

  const handleGenerate = async () => {
    if (!formData.title.trim()) {
      alert('请先输入架构标题');
      return;
    }
    setGenerating(true);
    try {
      const res = await architectureApi.generateByAi(id, {
        level: formData.level,
        parentId: formData.parentId,
        title: formData.title,
      });
      setFormData({
        ...formData,
        plotOutline: res.data.plotOutline || '',
        characters: JSON.stringify(res.data.characters || {}, null, 2),
        worldSetting: JSON.stringify(res.data.worldSetting || {}, null, 2),
        emotionalTone: res.data.emotionalTone || '',
      });
    } catch (error) {
      console.error('AI生成失败:', error);
      alert('AI生成失败: ' + (error.response?.data?.error || error.message));
    } finally {
      setGenerating(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!formData.title.trim()) return;
    try {
      await architectureApi.create(id, {
        level: formData.level,
        parentId: formData.parentId,
        title: formData.title,
        plotOutline: formData.plotOutline,
        characters: formData.characters,
        worldSetting: formData.worldSetting,
        emotionalTone: formData.emotionalTone,
      });
      resetForm();
      setShowCreate(false);
      loadData();
    } catch (error) {
      console.error('创建架构失败:', error);
    }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (!formData.title.trim()) return;
    try {
      await architectureApi.update(editingId, {
        title: formData.title,
        plotOutline: formData.plotOutline,
        characters: formData.characters,
        worldSetting: formData.worldSetting,
        emotionalTone: formData.emotionalTone,
      });
      resetForm();
      setEditingId(null);
      loadData();
    } catch (error) {
      console.error('更新架构失败:', error);
    }
  };

  const handleDelete = async (archId) => {
    if (!confirm('确定要删除这个架构吗？')) return;
    try {
      await architectureApi.delete(archId);
      loadData();
    } catch (error) {
      console.error('删除架构失败:', error);
    }
  };

  const startEdit = (arch) => {
    setEditingId(arch.id);
    setFormData({
      level: arch.level,
      parentId: arch.parent_id,
      title: arch.title,
      plotOutline: arch.plot_outline || '',
      characters: typeof arch.characters === 'string' ? arch.characters : JSON.stringify(arch.characters || {}, null, 2),
      worldSetting: typeof arch.world_setting === 'string' ? arch.world_setting : JSON.stringify(arch.world_setting || {}, null, 2),
      emotionalTone: arch.emotional_tone || '',
    });
    setShowCreate(false);
  };

  const handleGenerateChapterBatch = async () => {
    if (!selectedVolumeId) {
      alert('请选择卷架构');
      return;
    }
    setBatchGenerating(true);
    setGeneratedChapters([]);
    try {
      const res = await architectureApi.generateChapterArchitectures(id, selectedVolumeId);
      setGeneratedChapters(res.data || []);
    } catch (error) {
      console.error('生成章架构失败:', error);
      alert('生成失败: ' + (error.response?.data?.error || error.message));
    } finally {
      setBatchGenerating(false);
    }
  };

  const handleSaveChapterBatch = async () => {
    if (generatedChapters.length === 0) return;
    try {
      await architectureApi.batchCreateChapterArchitectures(id, selectedVolumeId, generatedChapters);
      setShowChapterBatch(false);
      setGeneratedChapters([]);
      setSelectedVolumeId('');
      loadData();
    } catch (error) {
      console.error('保存章架构失败:', error);
      alert('保存失败: ' + (error.response?.data?.error || error.message));
    }
  };

  const updateGeneratedChapter = (index, field, value) => {
    const updated = [...generatedChapters];
    updated[index][field] = value;
    setGeneratedChapters(updated);
  };

  const handleGenerateChapterContent = async (chapterArchId, chapterArchTitle) => {
    setGeneratingContent(chapterArchId);
    try {
      const res = await architectureApi.generateChapterContent(id, chapterArchId);
      setPreviewContent(res.data.content);
      setPreviewTitle(chapterArchTitle);
      setPreviewArchId(chapterArchId);
      setShowContentPreview(true);
    } catch (error) {
      console.error('生成章节正文失败:', error);
      alert('生成失败: ' + (error.response?.data?.error || error.message));
    } finally {
      setGeneratingContent(null);
    }
  };

  const handleSaveChapterContent = async () => {
    if (!previewContent || !previewArchId) return;
    try {
      const arch = architectures.find(a => a.id === previewArchId);
      await chapterApi.create(id, {
        architectureId: previewArchId,
        chapterNumber: 1,
        title: arch?.title || '未命名章节',
        content: previewContent,
        status: 'generated'
      });
      setShowContentPreview(false);
      setPreviewContent('');
      setPreviewArchId(null);
      loadData();
      alert('章节已保存');
    } catch (error) {
      console.error('保存章节失败:', error);
      alert('保存失败: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleBatchGenerateContent = async (volumeId) => {
    if (!confirm('确定要批量生成该卷下所有章节的正文吗？这可能需要较长时间。')) return;
    setBatchGeneratingContent(true);
    try {
      const res = await architectureApi.batchGenerateChapters(id, volumeId);
      const successCount = res.data.filter(r => r.success).length;
      const failCount = res.data.filter(r => !r.success).length;
      alert(`批量生成完成！成功: ${successCount}章，失败: ${failCount}章`);
      loadData();
    } catch (error) {
      console.error('批量生成失败:', error);
      alert('批量生成失败: ' + (error.response?.data?.error || error.message));
    } finally {
      setBatchGeneratingContent(false);
    }
  };

  const getChapterByArchId = (archId) => {
    return chapters.find(ch => ch.architecture_id === archId);
  };

  const fullArch = architectures.find(a => a.level === 'full');
  const volumes = architectures.filter(a => a.level === 'volume');
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
        <h1 className="text-2xl font-bold">架构管理</h1>
        <div className="flex gap-2">
          {volumes.length > 0 && (
            <button
              onClick={() => { setShowChapterBatch(true); setGeneratedChapters([]); setSelectedVolumeId(''); }}
              className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
            >
              批量生成章架构
            </button>
          )}
          <button
            onClick={() => { setShowCreate(true); setEditingId(null); resetForm(); }}
            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
          >
            创建架构
          </button>
        </div>
      </div>

      {(showCreate || editingId) && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">
                {editingId ? '编辑架构' : '创建架构'}
              </h2>
              {!editingId && (
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={generating}
                  className="bg-purple-500 text-white px-4 py-2 rounded hover:bg-purple-600 disabled:opacity-50"
                >
                  {generating ? 'AI生成中...' : '✨ AI生成内容'}
                </button>
              )}
            </div>
            <form onSubmit={editingId ? handleUpdate : handleCreate}>
              {!editingId && (
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-1">层级 *</label>
                  <select
                    value={formData.level}
                    onChange={(e) => setFormData({ ...formData, level: e.target.value, parentId: null })}
                    className="w-full border rounded px-3 py-2"
                  >
                    <option value="full">全本架构</option>
                    <option value="volume">卷架构</option>
                    <option value="chapter">章架构</option>
                  </select>
                </div>
              )}

              {!editingId && formData.level !== 'full' && (
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-1">父级架构</label>
                  <select
                    value={formData.parentId || ''}
                    onChange={(e) => setFormData({ ...formData, parentId: e.target.value ? parseInt(e.target.value) : null })}
                    className="w-full border rounded px-3 py-2"
                  >
                    <option value="">无</option>
                    {formData.level === 'volume' && fullArch && (
                      <option value={fullArch.id}>{fullArch.title} (全本)</option>
                    )}
                    {formData.level === 'chapter' && volumes.map(v => (
                      <option key={v.id} value={v.id}>{v.title} (卷)</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">标题 *</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                  required
                  placeholder="输入架构标题后可点击AI生成"
                />
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">情节大纲</label>
                <textarea
                  value={formData.plotOutline}
                  onChange={(e) => setFormData({ ...formData, plotOutline: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                  rows={5}
                  placeholder="AI将自动生成，也可手动编辑"
                />
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">人物设定 (JSON格式)</label>
                <textarea
                  value={formData.characters}
                  onChange={(e) => setFormData({ ...formData, characters: e.target.value })}
                  className="w-full border rounded px-3 py-2 font-mono text-sm"
                  rows={5}
                  placeholder='AI将自动生成，也可手动编辑'
                />
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">世界观设定 (JSON格式)</label>
                <textarea
                  value={formData.worldSetting}
                  onChange={(e) => setFormData({ ...formData, worldSetting: e.target.value })}
                  className="w-full border rounded px-3 py-2 font-mono text-sm"
                  rows={5}
                  placeholder='AI将自动生成，也可手动编辑'
                />
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">情感基调</label>
                <input
                  type="text"
                  value={formData.emotionalTone}
                  onChange={(e) => setFormData({ ...formData, emotionalTone: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                  placeholder="如：热血、温馨、悬疑"
                />
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => { setShowCreate(false); setEditingId(null); resetForm(); }}
                  className="px-4 py-2 border rounded hover:bg-gray-100"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                >
                  {editingId ? '保存' : '创建'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showChapterBatch && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">批量生成章架构</h2>

            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">选择卷架构 *</label>
              <select
                value={selectedVolumeId}
                onChange={(e) => setSelectedVolumeId(e.target.value)}
                className="w-full border rounded px-3 py-2"
              >
                <option value="">请选择卷架构</option>
                {volumes.map(v => (
                  <option key={v.id} value={v.id}>{v.title}</option>
                ))}
              </select>
            </div>

            <div className="mb-4">
              <button
                onClick={handleGenerateChapterBatch}
                disabled={batchGenerating || !selectedVolumeId}
                className="bg-purple-500 text-white px-4 py-2 rounded hover:bg-purple-600 disabled:opacity-50"
              >
                {batchGenerating ? 'AI生成中...' : '✨ AI生成章节架构'}
              </button>
            </div>

            {generatedChapters.length > 0 && (
              <div className="mb-4">
                <h3 className="font-semibold mb-2">生成的章节架构（可编辑）</h3>
                <div className="space-y-3 max-h-96 overflow-y-auto border rounded p-3">
                  {generatedChapters.map((ch, index) => (
                    <div key={index} className="border-b pb-3 last:border-b-0">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-sm font-medium text-gray-500 w-16">第{ch.chapterNumber}章</span>
                        <input
                          type="text"
                          value={ch.title}
                          onChange={(e) => updateGeneratedChapter(index, 'title', e.target.value)}
                          className="flex-1 border rounded px-2 py-1 text-sm"
                          placeholder="章节标题"
                        />
                      </div>
                      <textarea
                        value={ch.plotOutline}
                        onChange={(e) => updateGeneratedChapter(index, 'plotOutline', e.target.value)}
                        className="w-full border rounded px-2 py-1 text-sm"
                        rows={2}
                        placeholder="章节内容概括"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setShowChapterBatch(false); setGeneratedChapters([]); }}
                className="px-4 py-2 border rounded hover:bg-gray-100"
              >
                取消
              </button>
              {generatedChapters.length > 0 && (
                <button
                  onClick={handleSaveChapterBatch}
                  className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
                >
                  保存全部 ({generatedChapters.length}章)
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {showContentPreview && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">{previewTitle}</h2>
            <div className="mb-4 border rounded p-4 max-h-[60vh] overflow-y-auto whitespace-pre-wrap text-sm">
              {previewContent}
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowContentPreview(false);
                  setPreviewContent('');
                  setPreviewTitle('');
                  setPreviewArchId(null);
                }}
                className="px-4 py-2 border rounded hover:bg-gray-100"
              >
                关闭
              </button>
              {previewArchId && (
                <button
                  onClick={handleSaveChapterContent}
                  className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
                >
                  保存章节
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="space-y-6">
        {fullArch && (
          <div className="border rounded-lg p-4">
            <div className="flex justify-between items-start mb-2">
              <div>
                <span className="text-xs bg-blue-100 text-blue-600 px-2 py-1 rounded mr-2">全本</span>
                <span className="font-semibold text-lg">{fullArch.title}</span>
              </div>
              <div className="flex gap-2">
                <button onClick={() => startEdit(fullArch)} className="text-blue-500 hover:underline text-sm">编辑</button>
                <button onClick={() => handleDelete(fullArch.id)} className="text-red-500 hover:underline text-sm">删除</button>
              </div>
            </div>
            {fullArch.plot_outline && <p className="text-gray-600 text-sm mt-2">{fullArch.plot_outline}</p>}
          </div>
        )}

        {volumes.map(volume => {
          const volumeChapterArchs = chapterArchs.filter(a => a.parent_id === volume.id);
          return (
            <div key={volume.id} className="border rounded-lg p-4 ml-4">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <span className="text-xs bg-green-100 text-green-600 px-2 py-1 rounded mr-2">卷</span>
                  <span className="font-semibold">{volume.title}</span>
                  {volumeChapterArchs.length > 0 && (
                    <span className="text-xs text-gray-500 ml-2">({volumeChapterArchs.length}章架构)</span>
                  )}
                </div>
                <div className="flex gap-2 items-center">
                  {volumeChapterArchs.length > 0 && (
                    <button
                      onClick={() => handleBatchGenerateContent(volume.id)}
                      disabled={batchGeneratingContent}
                      className="text-orange-500 hover:underline text-sm disabled:opacity-50"
                    >
                      {batchGeneratingContent ? '生成中...' : '批量生成正文'}
                    </button>
                  )}
                  <button onClick={() => startEdit(volume)} className="text-blue-500 hover:underline text-sm">编辑</button>
                  <button onClick={() => handleDelete(volume.id)} className="text-red-500 hover:underline text-sm">删除</button>
                </div>
              </div>
              {volume.plot_outline && <p className="text-gray-600 text-sm mt-2">{volume.plot_outline}</p>}

              {volumeChapterArchs.map(chapterArch => {
                const existingChapter = getChapterByArchId(chapterArch.id);
                return (
                  <div key={chapterArch.id} className="border-l-2 border-gray-200 pl-4 mt-3">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs bg-yellow-100 text-yellow-600 px-2 py-1 rounded">章</span>
                          <span className="font-medium">{chapterArch.title}</span>
                          {existingChapter && (
                            <span className="text-xs bg-green-100 text-green-600 px-2 py-1 rounded">已生成</span>
                          )}
                        </div>
                        {chapterArch.plot_outline && <p className="text-gray-600 text-sm mt-1">{chapterArch.plot_outline}</p>}
                      </div>
                      <div className="flex gap-2 items-center ml-2">
                        {existingChapter ? (
                          <Link
                            to={`/chapter/${existingChapter.id}`}
                            className="text-green-600 hover:underline text-sm"
                          >
                            查看正文
                          </Link>
                        ) : (
                          <button
                            onClick={() => handleGenerateChapterContent(chapterArch.id, chapterArch.title)}
                            disabled={generatingContent === chapterArch.id}
                            className="text-orange-500 hover:underline text-sm disabled:opacity-50"
                          >
                            {generatingContent === chapterArch.id ? '生成中...' : '生成正文'}
                          </button>
                        )}
                        <button onClick={() => startEdit(chapterArch)} className="text-blue-500 hover:underline text-sm">编辑</button>
                        <button onClick={() => handleDelete(chapterArch.id)} className="text-red-500 hover:underline text-sm">删除</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {architectures.length === 0 && (
        <p className="text-center text-gray-500 py-12">还没有创建任何架构</p>
      )}
    </div>
  );
}

export default ArchitectureManager;
