import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { chapterApi, templateApi } from '../services/api';
import { useFeedback } from '../components/ui/FeedbackProvider';
import { PageShell, SectionCard, StatGrid } from '../components/ui/PageShell';

function statusClass(status) {
  if (status === 'generated') return 'bg-emerald-100 text-emerald-700';
  if (status === 'draft') return 'bg-slate-100 text-slate-600';
  return 'bg-sky-100 text-sky-700';
}

function statusLabel(status) {
  if (status === 'generated') return '已生成';
  if (status === 'draft') return '草稿';
  return status || '未开始';
}

function ChapterDetail() {
  const { id } = useParams();
  const feedback = useFeedback();
  const [chapter, setChapter] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState('read');
  const [editContent, setEditContent] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [review, setReview] = useState(null);
  const [versions, setVersions] = useState([]);
  const [regenerating, setRegenerating] = useState(false);

  useEffect(() => {
    loadData();
  }, [id]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [chapterRes, templateRes, versionRes] = await Promise.all([
        chapterApi.getById(id),
        templateApi.getAll(),
        chapterApi.getVersions(id),
      ]);

      setChapter(chapterRes.data);
      setEditContent(chapterRes.data.content || '');
      setEditTitle(chapterRes.data.title || '');
      setTemplates(templateRes.data);
      setVersions(versionRes.data);

      const defaultTemplate = templateRes.data.find((template) => template.is_default);
      setSelectedTemplate(defaultTemplate?.id ?? templateRes.data[0]?.id ?? null);
    } catch (error) {
      console.error('加载数据失败:', error);
      feedback.error('章节内容加载失败，请稍后重试。');
    } finally {
      setLoading(false);
    }
  };

  const hasUnsavedChanges =
    chapter &&
    (editTitle !== (chapter.title || '') || editContent !== (chapter.content || ''));

  const stats = useMemo(
    () => [
      { label: '章节序号', value: chapter?.chapter_number || '-', caption: '当前正文所在位置' },
      { label: '字数', value: (mode === 'edit' ? editContent : chapter?.content || '').length || 0, caption: '正文长度估算' },
      { label: '历史版本', value: versions.length, caption: versions.length ? '可回退到旧稿' : '还没有历史版本' },
      { label: '关联架构', value: chapter?.architecture_id ? '已关联' : '无', caption: chapter?.architecture_id ? '可用架构重生成' : '暂无可重生成来源' },
    ],
    [chapter, editContent, mode, versions.length]
  );

  const refreshVersions = async () => {
    const versionRes = await chapterApi.getVersions(id);
    setVersions(versionRes.data);
  };

  const handleSave = async () => {
    if (!editContent.trim()) {
      feedback.warning('正文内容不能为空。');
      return;
    }

    setSaving(true);
    try {
      const res = await chapterApi.update(id, {
        title: editTitle,
        content: editContent,
      });
      setChapter(res.data);
      await refreshVersions();
      setMode('read');
      feedback.success('章节内容已保存。');
    } catch (error) {
      console.error('保存失败:', error);
      feedback.error(error.response?.data?.error || '保存失败，请稍后再试。');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async () => {
    if (hasUnsavedChanges) {
      const confirmed = await feedback.confirm({
        title: '放弃当前修改？',
        message: '未保存的标题和正文改动都会丢失。',
        confirmText: '放弃修改',
        cancelText: '继续编辑',
        variant: 'danger',
      });
      if (!confirmed) return;
    }

    setEditContent(chapter.content || '');
    setEditTitle(chapter.title || '');
    setReview(null);
    setMode('read');
  };

  const handleGenerate = async () => {
    const confirmed = await feedback.confirm({
      title: '用 AI 覆盖当前编辑区内容？',
      message: '这会用模板重新生成章节正文。建议在继续前确认当前改动已保存。',
      note: hasUnsavedChanges ? '你当前还有未保存修改。继续后，编辑区将被新内容覆盖。' : undefined,
      confirmText: '开始生成',
      cancelText: '先不生成',
    });
    if (!confirmed) return;

    setGenerating(true);
    setReview(null);
    try {
      const res = await chapterApi.generate(id, selectedTemplate);
      setChapter(res.data.chapter);
      setEditContent(res.data.chapter.content || '');
      setEditTitle(res.data.chapter.title || '');
      setReview(res.data.review);
      await refreshVersions();
      setMode('edit');
      feedback.success('AI 已生成新正文草稿，请检查后保存。');
    } catch (error) {
      console.error('生成失败:', error);
      feedback.error(error.response?.data?.error || '生成失败，请稍后再试。');
    } finally {
      setGenerating(false);
    }
  };

  const handleRegenerate = async () => {
    const confirmed = await feedback.confirm({
      title: '按架构重新生成正文？',
      message: '系统会基于当前关联架构重新生成正文，并覆盖章节当前内容。',
      note: chapter?.architecture_id ? '如果想保留当前版本，建议先保存或确认历史版本中有可回退记录。' : '当前章节没有关联架构。',
      confirmText: '重新生成',
      cancelText: '取消',
      variant: 'danger',
    });
    if (!confirmed) return;

    setRegenerating(true);
    try {
      const res = await chapterApi.regenerate(id);
      setChapter(res.data);
      setEditContent(res.data.content || '');
      setEditTitle(res.data.title || '');
      await refreshVersions();
      setMode('read');
      feedback.success('章节已按架构重新生成。');
    } catch (error) {
      console.error('重新生成失败:', error);
      feedback.error(error.response?.data?.error || '重新生成失败，请稍后再试。');
    } finally {
      setRegenerating(false);
    }
  };

  const handleRestore = async (versionNumber) => {
    const confirmed = await feedback.confirm({
      title: `恢复到版本 ${versionNumber}？`,
      message: '恢复后，编辑区会切换到这个版本的内容，你仍然可以继续调整后再保存。',
      confirmText: '恢复这个版本',
      cancelText: '取消',
    });
    if (!confirmed) return;

    try {
      const res = await chapterApi.restoreVersion(id, versionNumber);
      setEditContent(res.data.content || '');
      setEditTitle(res.data.title || chapter.title || '');
      setChapter((current) => ({ ...current, ...res.data }));
      setMode('edit');
      feedback.success(`已切换到版本 ${versionNumber}，请确认后保存。`);
    } catch (error) {
      console.error('恢复失败:', error);
      feedback.error('恢复失败，请稍后再试。');
    }
  };

  const handleCopy = async () => {
    if (!chapter?.content) {
      feedback.warning('当前还没有可复制的正文。');
      return;
    }
    try {
      await navigator.clipboard.writeText(chapter.content);
      feedback.success('正文已复制到剪贴板。');
    } catch (error) {
      console.error('复制失败:', error);
      feedback.error('复制失败，请检查浏览器权限。');
    }
  };

  if (loading) {
    return <div className="flex min-h-[50vh] items-center justify-center text-slate-500">正在加载章节详情...</div>;
  }

  if (!chapter) {
    return <div className="py-20 text-center text-slate-500">章节不存在</div>;
  }

  return (
    <PageShell
      eyebrow="Chapter Studio"
      title={chapter.title || `第 ${chapter.chapter_number} 章`}
      description="先读，再决定是重生成、局部改写，还是直接回滚版本。把这些动作放到同一页里，避免打断写作节奏。"
      actions={
        <>
          <Link
            to={`/novels/${chapter.novel_id}/architecture`}
            className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:bg-white"
          >
            返回完整架构页
          </Link>
          <button
            type="button"
            onClick={handleCopy}
            className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-white"
          >
            复制正文
          </button>
          <button
            type="button"
            onClick={() => setMode('edit')}
            className="rounded-full bg-slate-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-600"
          >
            进入编辑
          </button>
        </>
      }
    >
      <StatGrid items={stats} />

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <SectionCard
          title="生成与回看"
          description="先决定要不要重新出稿，再进入精修，避免边写边犹豫。"
        >
          <div className="space-y-4">
            <div className="rounded-[24px] border border-slate-200 bg-slate-50/70 p-4">
              <div className="flex flex-col gap-4">
                <div>
                  <p className="text-sm font-semibold text-slate-800">AI 生成草稿</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    使用提示词模板重写当前章节。适合需要快速起稿或重置表达方式的时候。
                  </p>
                </div>
                <div className="grid gap-3">
                  <label className="grid gap-2">
                    <span className="text-sm font-medium text-slate-700">提示词模板</span>
                    <select
                      value={selectedTemplate || ''}
                      onChange={(event) => setSelectedTemplate(event.target.value ? parseInt(event.target.value, 10) : null)}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-sky-400"
                    >
                      {templates.map((template) => (
                        <option key={template.id} value={template.id}>
                          {template.name} {template.is_default ? '(默认)' : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={handleGenerate}
                    disabled={generating}
                    className="rounded-full bg-sky-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {generating ? '生成中...' : '用模板生成新草稿'}
                  </button>
                </div>
              </div>
            </div>

            {chapter.architecture_id ? (
              <div className="rounded-[24px] border border-amber-200 bg-amber-50/70 p-4">
                <p className="text-sm font-semibold text-amber-900">按架构重新生成</p>
                <p className="mt-2 text-sm leading-6 text-amber-800/80">
                  当前章节已绑定架构，可以直接按结构重新出稿，更适合大幅跑偏后的回正。
                </p>
                <button
                  type="button"
                  onClick={handleRegenerate}
                  disabled={regenerating}
                  className="mt-4 rounded-full bg-amber-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {regenerating ? '重新生成中...' : '按架构重新生成'}
                </button>
              </div>
            ) : null}

            {review ? (
              <div className={`rounded-[24px] border p-4 ${review.score >= 70 ? 'border-emerald-200 bg-emerald-50/70' : 'border-amber-200 bg-amber-50/70'}`}>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-800">AI 审核报告</p>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${review.score >= 70 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                    评分 {review.score}
                  </span>
                </div>
                {review.issues?.length ? (
                  <div className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
                    {review.issues.map((issue, index) => (
                      <div key={`${issue.type}-${index}`} className="rounded-2xl bg-white/80 px-3 py-2">
                        <span className="font-semibold text-rose-600">{issue.type}</span>
                        <span className="ml-2">{issue.description}</span>
                        {issue.suggestion ? <p className="mt-1 text-slate-500">建议：{issue.suggestion}</p> : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm leading-6 text-slate-600">这次生成没有发现明显问题，可以直接进入人工润色。</p>
                )}
              </div>
            ) : null}
          </div>
        </SectionCard>

        <SectionCard title="版本历史" description="回退动作应当在阅读态就清晰可见，而不是必须先进入编辑态。">
          {versions.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
              还没有历史版本。第一次保存或重新生成后，这里会开始积累回退记录。
            </div>
          ) : (
            <div className="space-y-3">
              {versions.map((version) => (
                <div key={version.id} className="rounded-[24px] border border-slate-200 bg-slate-50/70 px-4 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">版本 {version.version_number}</p>
                      <p className="mt-1 text-sm text-slate-500">{new Date(version.created_at).toLocaleString()}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRestore(version.version_number)}
                      className="rounded-full border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-white"
                    >
                      恢复到编辑区
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      <SectionCard
        title={mode === 'edit' ? '精修工作区' : '阅读视图'}
        description={
          mode === 'edit'
            ? '左侧编辑，右侧预览；如果只是看内容，可以随时回到阅读视图。'
            : '先通读整章，再判断是继续润色、重生成，还是回退旧版本。'
        }
        actions={
          mode === 'edit' ? (
            <>
              <button
                type="button"
                onClick={handleCancel}
                className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
              >
                取消编辑
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? '保存中...' : '保存章节'}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setMode('edit')}
              className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-white"
            >
              开始润色
            </button>
          )
        }
      >
        {mode === 'edit' ? (
          <div className="grid gap-0 overflow-hidden rounded-[28px] border border-slate-200 lg:grid-cols-2">
            <div className="border-b border-slate-200 bg-white lg:border-b-0 lg:border-r">
              <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
                <input
                  type="text"
                  value={editTitle}
                  onChange={(event) => setEditTitle(event.target.value)}
                  className="w-full bg-transparent text-lg font-semibold text-slate-900 outline-none"
                  placeholder="章节标题"
                />
                <p className="mt-1 text-xs text-slate-400">
                  {hasUnsavedChanges ? '有未保存修改' : '当前编辑区与已保存内容一致'}
                </p>
              </div>
              <textarea
                value={editContent}
                onChange={(event) => setEditContent(event.target.value)}
                className="min-h-[680px] w-full resize-y px-4 py-4 font-mono text-sm leading-7 text-slate-800 outline-none"
                placeholder="在这里撰写章节内容，支持 Markdown。"
              />
            </div>
            <div className="bg-slate-50/60">
              <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-600">
                实时预览
              </div>
              <div className="min-h-[680px] overflow-y-auto p-5">
                <div className="prose prose-slate max-w-none">
                  <ReactMarkdown>{editContent || '*暂无内容*'}</ReactMarkdown>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-[28px] border border-slate-200 bg-white px-6 py-8 shadow-[0_16px_40px_rgba(15,23,42,0.04)]">
            <div className="mb-6 flex flex-wrap items-center gap-3 text-sm text-slate-500">
              <span className="rounded-full bg-slate-100 px-3 py-1 font-medium">
                第 {chapter.chapter_number} 章
              </span>
              <span className={`rounded-full px-3 py-1 font-medium ${statusClass(chapter.status)}`}>
                {statusLabel(chapter.status)}
              </span>
            </div>
            <div className="prose prose-lg max-w-none">
              <ReactMarkdown>{chapter.content || '*暂无内容，点击上方按钮开始生成或编辑正文。*'}</ReactMarkdown>
            </div>
          </div>
        )}
      </SectionCard>
    </PageShell>
  );
}

export default ChapterDetail;
