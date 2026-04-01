import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { architectureApi, chapterApi } from '../services/api';
import { useFeedback } from '../components/ui/FeedbackProvider';
import JsonField from '../components/ui/JsonField';
import { PageShell, SectionCard, StatGrid } from '../components/ui/PageShell';

const initialForm = {
  level: 'full',
  parentId: null,
  title: '',
  plotOutline: '',
  characters: '',
  worldSetting: '',
  emotionalTone: '',
};

function ArchitectureManager() {
  const { id } = useParams();
  const feedback = useFeedback();
  const [architectures, setArchitectures] = useState([]);
  const [chapters, setChapters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
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
  const [previewChapterNumber, setPreviewChapterNumber] = useState(1);
  const [savingPreview, setSavingPreview] = useState(false);
  const [formData, setFormData] = useState(initialForm);

  useEffect(() => {
    loadData();
  }, [id]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [archRes, chapterRes] = await Promise.all([
        architectureApi.getByNovelId(id),
        chapterApi.getByNovelId(id),
      ]);
      setArchitectures(archRes.data);
      setChapters(chapterRes.data);
    } catch (error) {
      console.error('加载数据失败:', error);
      feedback.error('架构工作台加载失败，请稍后重试。');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData(initialForm);
  };

  const closeEditor = () => {
    setShowCreate(false);
    setEditingId(null);
    resetForm();
  };

  const getNextChapterNumber = (archId) => {
    const existing = chapters.find((chapter) => chapter.architecture_id === archId);
    if (existing) return existing.chapter_number;
    const max = chapters.reduce((result, chapter) => Math.max(result, chapter.chapter_number || 0), 0);
    return max + 1;
  };

  const startCreate = () => {
    setEditingId(null);
    // 如果已存在全本架构，新建时默认选择卷架构，并自动设置父级
    const existingFullArch = architectures.find((arch) => arch.level === 'full');
    setFormData({
      ...initialForm,
      level: existingFullArch ? 'volume' : 'full',
      parentId: existingFullArch ? existingFullArch.id : null,
    });
    setShowCreate(true);
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
    setShowCreate(true);
  };

  const handleGenerate = async () => {
    if (!formData.title.trim()) {
      feedback.warning('请先输入架构标题，再让 AI 帮你展开内容。');
      return;
    }
    setGenerating(true);
    try {
      const res = await architectureApi.generateByAi(id, {
        level: formData.level,
        parentId: formData.parentId,
        title: formData.title,
      });
      setFormData((current) => ({
        ...current,
        plotOutline: res.data.plotOutline || '',
        characters: JSON.stringify(res.data.characters || {}, null, 2),
        worldSetting: JSON.stringify(res.data.worldSetting || {}, null, 2),
        emotionalTone: res.data.emotionalTone || '',
      }));
      feedback.success('AI 已补齐当前架构草稿，你可以继续微调后再保存。');
    } catch (error) {
      console.error('AI生成失败:', error);
      feedback.error(error.response?.data?.error || 'AI 生成失败，请稍后再试。');
    } finally {
      setGenerating(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!formData.title.trim()) {
      feedback.warning('标题不能为空。');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        level: formData.level,
        parentId: formData.parentId,
        title: formData.title,
        plotOutline: formData.plotOutline,
        characters: formData.characters,
        worldSetting: formData.worldSetting,
        emotionalTone: formData.emotionalTone,
      };

      if (editingId) {
        await architectureApi.update(editingId, payload);
        feedback.success('架构已更新。');
      } else {
        await architectureApi.create(id, payload);
        feedback.success('新架构已创建。');
      }

      closeEditor();
      loadData();
    } catch (error) {
      console.error('保存架构失败:', error);
      feedback.error(error.response?.data?.error || '保存失败，请稍后重试。');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (arch) => {
    const confirmed = await feedback.confirm({
      title: `删除「${arch.title}」？`,
      message: '删除后，这条架构及其关联关系将从工作台中移除。',
      note: arch.level === 'volume' ? '如果卷下还有章架构，建议先确认是否需要保留。' : undefined,
      confirmText: '确认删除',
      cancelText: '保留',
      variant: 'danger',
    });
    if (!confirmed) return;

    try {
      await architectureApi.delete(arch.id);
      feedback.success('架构已删除。');
      loadData();
    } catch (error) {
      console.error('删除架构失败:', error);
      feedback.error(error.response?.data?.error || '删除失败，请稍后再试。');
    }
  };

  const handleGenerateChapterBatch = async () => {
    if (!selectedVolumeId) {
      feedback.warning('请先选择一个卷架构。');
      return;
    }
    setBatchGenerating(true);
    setGeneratedChapters([]);
    try {
      const res = await architectureApi.generateChapterArchitectures(id, selectedVolumeId);
      setGeneratedChapters(res.data || []);
      feedback.success(`已生成 ${res.data?.length || 0} 条章架构草稿。`);
    } catch (error) {
      console.error('生成章架构失败:', error);
      feedback.error(error.response?.data?.error || '章架构生成失败，请稍后重试。');
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
      feedback.success(`已保存 ${generatedChapters.length} 条章架构。`);
      loadData();
    } catch (error) {
      console.error('保存章架构失败:', error);
      feedback.error(error.response?.data?.error || '保存失败，请稍后再试。');
    }
  };

  const updateGeneratedChapter = (index, field, value) => {
    setGeneratedChapters((current) => {
      const next = [...current];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleGenerateChapterContent = async (chapterArch) => {
    setGeneratingContent(chapterArch.id);
    try {
      const res = await architectureApi.generateChapterContent(id, chapterArch.id);
      const chapterNumber = getNextChapterNumber(chapterArch.id);

      // 直接保存章节，不显示弹窗
      await chapterApi.create(id, {
        architectureId: chapterArch.id,
        chapterNumber: chapterNumber,
        title: chapterArch.title || '未命名章节',
        content: res.data.content,
        status: 'generated',
      });

      feedback.success(`「${chapterArch.title}」已生成并保存为第 ${chapterNumber} 章。`);
      loadData();
    } catch (error) {
      console.error('生成章节正文失败:', error);
      feedback.error(error.response?.data?.error || '生成失败，请稍后再试。');
    } finally {
      setGeneratingContent(null);
    }
  };

  const closePreview = () => {
    setShowContentPreview(false);
    setPreviewContent('');
    setPreviewTitle('');
    setPreviewArchId(null);
  };

  const handleSaveChapterContent = async () => {
    if (!previewContent || !previewArchId) return;
    setSavingPreview(true);
    try {
      const arch = architectures.find((item) => item.id === previewArchId);
      await chapterApi.create(id, {
        architectureId: previewArchId,
        chapterNumber: previewChapterNumber,
        title: arch?.title || '未命名章节',
        content: previewContent,
        status: 'generated',
      });
      closePreview();
      feedback.success(`章节已保存为第 ${previewChapterNumber} 章。`);
      loadData();
    } catch (error) {
      console.error('保存章节失败:', error);
      feedback.error(error.response?.data?.error || '保存失败，请稍后再试。');
    } finally {
      setSavingPreview(false);
    }
  };

  const handleBatchGenerateContent = async (volume) => {
    const confirmed = await feedback.confirm({
      title: `批量生成「${volume.title}」的正文？`,
      message: '系统会按该卷下的章架构逐章生成正文，这可能需要较长时间。',
      note: '建议先确认章架构顺序和标题都已经稳定。',
      confirmText: '开始生成',
      cancelText: '稍后再说',
    });
    if (!confirmed) return;

    setBatchGeneratingContent(true);
    try {
      const res = await architectureApi.batchGenerateChapters(id, volume.id);
      const successCount = res.data.filter((item) => item.success).length;
      const failCount = res.data.filter((item) => !item.success).length;
      feedback.success(`批量生成完成：成功 ${successCount} 章，失败 ${failCount} 章。`, {
        title: '正文生产完成',
        duration: 4800,
      });
      loadData();
    } catch (error) {
      console.error('批量生成失败:', error);
      feedback.error(error.response?.data?.error || '批量生成失败，请稍后再试。');
    } finally {
      setBatchGeneratingContent(false);
    }
  };

  const getChapterByArchId = (archId) => chapters.find((chapter) => chapter.architecture_id === archId);

  const fullArch = architectures.find((arch) => arch.level === 'full');
  const volumes = architectures.filter((arch) => arch.level === 'volume');
  const chapterArchs = architectures.filter((arch) => arch.level === 'chapter');

  const stats = useMemo(
    () => [
      { label: '全本架构', value: fullArch ? 1 : 0, caption: fullArch ? '总纲已建立' : '建议先建立总纲' },
      { label: '卷架构', value: volumes.length, caption: '用于管理篇章节奏' },
      { label: '章架构', value: chapterArchs.length, caption: '每一章的内容概括' },
      {
        label: '已落正文',
        value: chapters.filter((chapter) => chapter.architecture_id).length,
        caption: '与章架构挂钩的已生成章节',
      },
    ],
    [chapterArchs.length, chapters, fullArch, volumes.length]
  );

  if (loading) {
    return <div className="flex min-h-[50vh] items-center justify-center text-slate-500">正在加载架构工作台...</div>;
  }

  return (
    <PageShell
      eyebrow="Architecture Studio"
      title="小说架构工作台"
      description="先稳住三层架构，再决定是批量拆章，还是直接进入正文生产。这里把结构编辑和 AI 生产拆成了两个更清晰的工作区。"
      actions={
        <>
          <Link
            to={`/novels/${id}`}
            className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:bg-white"
          >
            返回小说工作台
          </Link>
          {volumes.length > 0 ? (
            <button
              type="button"
              onClick={() => {
                setShowChapterBatch(true);
                setGeneratedChapters([]);
                setSelectedVolumeId('');
              }}
              className="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 transition hover:bg-emerald-100"
            >
              批量生成章架构
            </button>
          ) : null}
          <button
            type="button"
            onClick={startCreate}
            className="rounded-full bg-slate-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-600"
          >
            新建架构
          </button>
        </>
      }
    >
      <StatGrid items={stats} />

      <div className="space-y-6">
        <SectionCard
          title="结构编辑区"
          description="这里优先处理全本、卷、章三级结构。先把骨架写顺，后面的生成结果会稳定很多。"
          actions={
            <button
              type="button"
              onClick={startCreate}
              className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
            >
              添加一条架构
            </button>
          }
        >
          <div className="space-y-6">
            {fullArch ? (
              <div className="rounded-[28px] border border-sky-200 bg-sky-50/70 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-sky-700 shadow-sm">全本</span>
                    <h3 className="mt-3 text-xl font-semibold text-slate-900">{fullArch.title}</h3>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => startEdit(fullArch)} className="rounded-full border border-white px-3 py-1.5 text-sm text-slate-700 hover:bg-white">
                      编辑
                    </button>
                    <button type="button" onClick={() => handleDelete(fullArch)} className="rounded-full border border-rose-200 px-3 py-1.5 text-sm text-rose-600 hover:bg-white">
                      删除
                    </button>
                  </div>
                </div>
                <p className="mt-4 text-sm leading-7 text-slate-600">{fullArch.plot_outline || '还没有全本情节大纲。'}</p>
              </div>
            ) : (
              <div className="rounded-[28px] border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center">
                <p className="text-lg font-semibold text-slate-800">还没有全本架构</p>
                <p className="mt-2 text-sm leading-6 text-slate-500">建议先建立总纲，再去拆卷和章节。</p>
              </div>
            )}

            {volumes.length > 0 ? (
              <div className="space-y-4">
                {volumes.map((volume) => {
                  const volumeChapterArchs = chapterArchs.filter((arch) => arch.parent_id === volume.id);
                  return (
                    <div key={volume.id} className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.05)]">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">卷</span>
                          <h3 className="mt-3 text-lg font-semibold text-slate-900">{volume.title}</h3>
                          <p className="mt-2 text-sm text-slate-500">
                            {volumeChapterArchs.length} 条章架构
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {volumeChapterArchs.length > 0 ? (
                            <button
                              type="button"
                              onClick={() => handleBatchGenerateContent(volume)}
                              disabled={batchGeneratingContent}
                              className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-700 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {batchGeneratingContent ? '生成中...' : '批量生成正文'}
                            </button>
                          ) : null}
                          <button type="button" onClick={() => startEdit(volume)} className="rounded-full border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
                            编辑
                          </button>
                          <button type="button" onClick={() => handleDelete(volume)} className="rounded-full border border-rose-200 px-3 py-1.5 text-sm text-rose-600 hover:bg-rose-50">
                            删除
                          </button>
                        </div>
                      </div>
                      <p className="mt-4 text-sm leading-7 text-slate-600">{volume.plot_outline || '还没有卷情节概括。'}</p>

                      {volumeChapterArchs.length > 0 ? (
                        <div className="mt-5 grid gap-3">
                          {volumeChapterArchs.map((chapterArch, index) => {
                            const existingChapter = getChapterByArchId(chapterArch.id);
                            return (
                              <div key={chapterArch.id} className="rounded-[22px] border border-slate-200 bg-slate-50/70 px-4 py-4">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">第{index + 1}章</span>
                                      <p className="text-sm font-semibold text-slate-900">{chapterArch.title}</p>
                                      {existingChapter ? (
                                        <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">已生成正文</span>
                                      ) : null}
                                    </div>
                                    <p className="mt-2 text-sm leading-6 text-slate-600">{chapterArch.plot_outline || '还没有内容概括。'}</p>
                                  </div>
                                  <div className="flex flex-wrap gap-2">
                                    {existingChapter ? (
                                      <Link
                                        to={`/chapters/${existingChapter.id}`}
                                        className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700 transition hover:bg-emerald-100"
                                      >
                                        查看正文
                                      </Link>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => handleGenerateChapterContent(chapterArch)}
                                        disabled={generatingContent === chapterArch.id}
                                        className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-700 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                                      >
                                        {generatingContent === chapterArch.id ? '生成中...' : '生成正文'}
                                      </button>
                                    )}
                                    <button type="button" onClick={() => startEdit(chapterArch)} className="rounded-full border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-white">
                                      编辑
                                    </button>
                                    <button type="button" onClick={() => handleDelete(chapterArch)} className="rounded-full border border-rose-200 px-3 py-1.5 text-sm text-rose-600 hover:bg-white">
                                      删除
                                    </button>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="mt-5 rounded-[22px] border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                          这个卷还没有章架构，可以用右上角的“批量生成章架构”快速拆章。
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        </SectionCard>
      </div>

      {(showCreate || editingId) ? (
        <div className="fixed inset-0 z-[75] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-[32px] border border-white/60 bg-white p-6 shadow-2xl">
            <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                  {editingId ? 'Edit Architecture' : 'Create Architecture'}
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-900">
                  {editingId ? '编辑架构' : '创建架构'}
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  {editingId ? '优先修正当前结构信息。' : '先确定层级和标题，再让 AI 帮你补大纲。'}
                </p>
              </div>
              {!editingId ? (
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={generating}
                  className="rounded-full bg-slate-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {generating ? 'AI 生成中...' : '让 AI 补全内容'}
                </button>
              ) : null}
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {!editingId ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="grid gap-2">
                    <span className="text-sm font-medium text-slate-700">层级</span>
                    <select
                      value={formData.level}
                      onChange={(event) => setFormData({ ...formData, level: event.target.value, parentId: null })}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-sky-400"
                    >
                      <option value="full">全本架构</option>
                      <option value="volume">卷架构</option>
                      <option value="chapter">章架构</option>
                    </select>
                  </label>
                  {formData.level !== 'full' ? (
                    <label className="grid gap-2">
                      <span className="text-sm font-medium text-slate-700">父级架构</span>
                      <select
                        value={formData.parentId || ''}
                        onChange={(event) => setFormData({ ...formData, parentId: event.target.value ? parseInt(event.target.value, 10) : null })}
                        className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-sky-400"
                      >
                        <option value="">请选择</option>
                        {formData.level === 'volume' && fullArch ? <option value={fullArch.id}>{fullArch.title}</option> : null}
                        {formData.level === 'chapter'
                          ? volumes.map((volume) => (
                            <option key={volume.id} value={volume.id}>
                              {volume.title}
                            </option>
                          ))
                          : null}
                      </select>
                    </label>
                  ) : null}
                </div>
              ) : null}

              <label className="grid gap-2">
                <span className="text-sm font-medium text-slate-700">标题</span>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(event) => setFormData({ ...formData, title: event.target.value })}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-sky-400"
                  placeholder="先起一个工作标题，方便 AI 抓主轴"
                  required
                />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-medium text-slate-700">情节大纲</span>
                <textarea
                  value={formData.plotOutline}
                  onChange={(event) => setFormData({ ...formData, plotOutline: event.target.value })}
                  rows={7}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-sky-400"
                  placeholder="写清这层结构想解决的冲突、推进和结果。"
                />
              </label>

              <div className="grid gap-4 xl:grid-cols-2">
                <JsonField
                  label="人物设定"
                  value={formData.characters}
                  onChange={(value) => setFormData({ ...formData, characters: value })}
                  placeholder='{"主角": {"name": "林川", "goal": "..."}}'
                  helper="如果不想手写完整 JSON，可以先让 AI 生成，再局部改动。"
                />
                <JsonField
                  label="世界观设定"
                  value={formData.worldSetting}
                  onChange={(value) => setFormData({ ...formData, worldSetting: value })}
                  placeholder='{"era": "近未来", "rules": "..."}'
                  helper="保持结构化记录，后续回看和生成时更容易复用。"
                />
              </div>

              <label className="grid gap-2 sm:max-w-md">
                <span className="text-sm font-medium text-slate-700">情感基调</span>
                <input
                  type="text"
                  value={formData.emotionalTone}
                  onChange={(event) => setFormData({ ...formData, emotionalTone: event.target.value })}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-sky-400"
                  placeholder="热血 / 温柔 / 压迫 / 悬疑"
                />
              </label>

              <div className="flex flex-wrap justify-end gap-3">
                <button
                  type="button"
                  onClick={closeEditor}
                  className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-full bg-sky-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? '保存中...' : editingId ? '保存架构' : '创建架构'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {showChapterBatch ? (
        <div className="fixed inset-0 z-[75] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-[32px] border border-white/60 bg-white p-6 shadow-2xl">
            <div className="mb-5">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Batch Chapter Design</p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-900">批量生成章架构</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                先选卷，再生成一批可编辑的章概括。生成后建议快速扫一遍标题和承接关系。
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
              <label className="grid gap-2">
                <span className="text-sm font-medium text-slate-700">选择卷架构</span>
                <select
                  value={selectedVolumeId}
                  onChange={(event) => setSelectedVolumeId(event.target.value)}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-sky-400"
                >
                  <option value="">请选择卷架构</option>
                  {volumes.map((volume) => (
                    <option key={volume.id} value={volume.id}>
                      {volume.title}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={handleGenerateChapterBatch}
                disabled={batchGenerating || !selectedVolumeId}
                className="rounded-full bg-slate-500 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {batchGenerating ? 'AI 生成中...' : '生成章架构草稿'}
              </button>
            </div>

            {generatedChapters.length > 0 ? (
              <div className="mt-6 space-y-3">
                {generatedChapters.map((chapter, index) => (
                  <div key={`${chapter.chapterNumber}-${index}`} className="rounded-[24px] border border-slate-200 bg-slate-50/70 p-4">
                    <div className="grid gap-3 md:grid-cols-[auto_1fr] md:items-center">
                      <div className="rounded-full bg-white px-3 py-2 text-sm font-semibold text-slate-600 shadow-sm">
                        第 {chapter.chapterNumber} 章
                      </div>
                      <input
                        type="text"
                        value={chapter.title}
                        onChange={(event) => updateGeneratedChapter(index, 'title', event.target.value)}
                        className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-sky-400"
                        placeholder="章节标题"
                      />
                    </div>
                    <textarea
                      value={chapter.plotOutline}
                      onChange={(event) => updateGeneratedChapter(index, 'plotOutline', event.target.value)}
                      rows={3}
                      className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-sky-400"
                      placeholder="章节概括"
                    />
                  </div>
                ))}
              </div>
            ) : null}

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowChapterBatch(false);
                  setGeneratedChapters([]);
                }}
                className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
              >
                关闭
              </button>
              {generatedChapters.length > 0 ? (
                <button
                  type="button"
                  onClick={handleSaveChapterBatch}
                  className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700"
                >
                  保存全部 {generatedChapters.length} 章
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {showContentPreview ? (
        <div className="fixed inset-0 z-[75] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-[32px] border border-white/60 bg-white p-6 shadow-2xl">
            <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Chapter Preview</p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-900">{previewTitle}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  这是 AI 生成的正文预览。确认风格和承接都没问题后，再保存成正式章节。
                </p>
              </div>
              <label className="grid gap-2 sm:max-w-[10rem]">
                <span className="text-sm font-medium text-slate-700">保存为章节号</span>
                <input
                  type="number"
                  min="1"
                  value={previewChapterNumber}
                  onChange={(event) => setPreviewChapterNumber(parseInt(event.target.value || '1', 10))}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-sky-400"
                />
              </label>
            </div>
            <div className="rounded-[28px] border border-slate-200 bg-slate-50/70 p-5 text-sm leading-8 whitespace-pre-wrap text-slate-700">
              {previewContent}
            </div>
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={closePreview}
                className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
              >
                关闭预览
              </button>
              <button
                type="button"
                onClick={handleSaveChapterContent}
                disabled={savingPreview}
                className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingPreview ? '保存中...' : '保存为正式章节'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </PageShell>
  );
}

export default ArchitectureManager;
