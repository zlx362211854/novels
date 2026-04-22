import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { chapterApi, architectureApi } from '../services/api';
import PublishDialog from '../components/PublishDialog';
import { useFeedback } from '../components/ui/FeedbackProvider';
import { MarkdownEditor } from '../components/ui/MarkdownEditor';
import { PageShell, SectionCard, StatGrid } from '../components/ui/PageShell';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Label } from '../components/ui/label';
import { Alert, AlertTitle, AlertDescription } from '../components/ui/alert';
import { ScrollArea } from '../components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '../components/ui/tooltip';
import { Card, CardContent } from '../components/ui/card';
import { cn } from '@/lib/utils';
import {
  ArrowLeft,
  Copy,
  Edit3,
  Save,
  X,
  Sparkles,
  RefreshCw,
  History,
  FileText,
  AlertTriangle,
  CheckCircle,
  Info,
  Upload,
  BookOpen,
  ChevronRight,
  Brain,
} from 'lucide-react';

function statusVariant(status) {
  if (status === 'generated') return 'default';
  if (status === 'draft') return 'secondary';
  return 'outline';
}

function statusLabel(status) {
  if (status === 'generated') return '已生成';
  if (status === 'draft') return '草稿';
  return status || '未开始';
}

function issueTypeLabel(type) {
  const labels = {
    character_state_conflict: '人物状态冲突',
    knowledge_conflict: '信息知晓冲突',
    timeline_conflict: '时间线冲突',
    world_rule_conflict: '世界规则冲突',
    item_state_conflict: '关键物品状态冲突',
    review_error: '审核服务异常',
    parse_error: '审核结果解析异常',
  };

  return labels[type] || type || '未知问题';
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
  const [generating, setGenerating] = useState(false);
  const [review, setReview] = useState(null);
  const [versions, setVersions] = useState([]);
  const [regenerating, setRegenerating] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [revising, setRevising] = useState(false);
  const [showPublishDialog, setShowPublishDialog] = useState(false);
  const [architecture, setArchitecture] = useState(null);
  const [editingArchitecture, setEditingArchitecture] = useState(false);
  const [architecturePlotOutline, setArchitecturePlotOutline] = useState('');
  const [savingArchitecture, setSavingArchitecture] = useState(false);
  const [memory, setMemory] = useState(null);
  const [memoryMode, setMemoryMode] = useState('read'); // 'read' | 'edit'
  const [editMemory, setEditMemory] = useState(null);
  const [savingMemory, setSavingMemory] = useState(false);
  const [regeneratingMemory, setRegeneratingMemory] = useState(false);
  const [reviseIdea, setReviseIdea] = useState('');
  const [nextChapter, setNextChapter] = useState(null);

  useEffect(() => {
    loadData();
  }, [id]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [chapterRes, versionRes] = await Promise.all([
        chapterApi.getById(id),
        chapterApi.getVersions(id),
      ]);

      const chapterData = chapterRes.data;
      setChapter(chapterData);
      setEditContent(chapterData.content || '');
      setEditTitle(chapterData.title || '');
      setReview(chapterData.review_result || null);
      setVersions(versionRes.data);

      if (chapterData.architecture_id) {
        try {
          const archRes = await architectureApi.getById(chapterData.architecture_id);
          setArchitecture(archRes.data);
          setArchitecturePlotOutline(archRes.data?.plot_outline || '');
        } catch (e) {
          console.error('加载章节架构失败:', e);
        }
      }
      try {
        const memRes = await chapterApi.getMemory(id);
        if (memRes.data) {
          setMemory(memRes.data);
        }
      } catch (e) {
        console.error('加载记忆卡失败:', e);
      }

      if (chapterData.novel_id) {
        try {
          const chaptersRes = await chapterApi.getByNovelId(chapterData.novel_id);
          const sortedChapters = [...chaptersRes.data].sort(
            (left, right) => (left.chapter_number || 0) - (right.chapter_number || 0)
          );
          const currentIndex = sortedChapters.findIndex((item) => item.id === chapterData.id);
          setNextChapter(currentIndex >= 0 ? sortedChapters[currentIndex + 1] || null : null);
        } catch (nextError) {
          console.error('加载下一章信息失败:', nextError);
          setNextChapter(null);
        }
      }
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
      {
        label: '字数',
        value: (mode === 'edit' ? editContent : chapter?.content || '').length || 0,
        caption: '正文长度估算',
      },
      {
        label: '历史版本',
        value: versions.length,
        caption: versions.length ? '可回退到旧稿' : '还没有历史版本',
      },
      {
        label: '关联架构',
        value: chapter?.architecture_id ? '已关联' : '无',
        caption: chapter?.architecture_id ? '可用架构重生成' : '暂无可重生成来源',
      },
    ],
    [chapter, editContent, mode, versions.length]
  );

  const refreshVersions = async () => {
    const versionRes = await chapterApi.getVersions(id);
    setVersions(versionRes.data);
  };

  const handleSave = async ({ regenerateMemory = false } = {}) => {
    if (!editContent.trim()) {
      feedback.warning('正文内容不能为空。');
      return;
    }

    setSaving(true);
    try {
      const res = await chapterApi.update(id, {
        title: editTitle,
        content: editContent,
        regenerateMemory,
      });
      setChapter(res.data);
      setReview(res.data.review_result || null);
      await refreshVersions();
      setMode('read');
      feedback.success(regenerateMemory ? '章节已保存，记忆卡重新生成中。' : '章节内容已保存。');
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
      message: '这会用 AI 重新生成章节正文。建议在继续前确认当前改动已保存。',
      note: hasUnsavedChanges
        ? '你当前还有未保存修改。继续后，编辑区将被新内容覆盖。'
        : undefined,
      confirmText: '开始生成',
      cancelText: '先不生成',
    });
    if (!confirmed) return;

    setGenerating(true);
    setReview(null);
    try {
      const res = await chapterApi.generate(id);
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
      note: chapter?.architecture_id
        ? '如果想保留当前版本，建议先保存或确认历史版本中有可回退记录。'
        : '当前章节没有关联架构。',
      confirmText: '重新生成',
      cancelText: '取消',
      variant: 'danger',
    });
    if (!confirmed) return;

    setRegenerating(true);
    try {
      const res = await chapterApi.generate(id);
      setChapter(res.data.chapter);
      setEditContent(res.data.chapter.content || '');
      setEditTitle(res.data.chapter.title || '');
      setReview(res.data.review || null);
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

  const handleReview = async () => {
    if (!chapter?.content) {
      feedback.warning('当前还没有可审阅的正文。');
      return;
    }

    setReviewing(true);
    try {
      const res = await chapterApi.review(id);
      setReview(res.data);
      feedback.success('章节审阅已完成。');
    } catch (error) {
      console.error('审阅失败:', error);
      feedback.error(error.response?.data?.error || '审阅失败，请稍后再试。');
    } finally {
      setReviewing(false);
    }
  };

  const handleRevise = async () => {
    if (!review?.issues?.length && !review?.notes?.length) {
      feedback.warning('当前没有可用于修订的问题或提示。');
      return;
    }

    setRevising(true);
    try {
      const res = await chapterApi.revise(id, review, reviseIdea);
      setChapter(res.data.chapter);
      setEditContent(res.data.chapter.content || '');
      setEditTitle(res.data.chapter.title || '');
      setReview(res.data.review || null);
      try {
        const memoryRes = await chapterApi.getMemory(id);
        setMemory(memoryRes.data || null);
      } catch (memoryError) {
        console.error('刷新记忆卡失败:', memoryError);
      }
      await refreshVersions();
      setMode('edit');
      setReviseIdea('');
      feedback.success('修订稿已应用到当前章节，可在历史版本中回退。');
    } catch (error) {
      console.error('生成修订稿失败:', error);
      feedback.error(error.response?.data?.error || '生成修订稿失败，请稍后再试。');
    } finally {
      setRevising(false);
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
      setReview(res.data.review_result || null);
      setMode('edit');
      feedback.success(`已切换到版本 ${versionNumber}，请确认后保存。`);
    } catch (error) {
      console.error('恢复失败:', error);
      feedback.error('恢复失败，请稍后再试。');
    }
  };

  const handleEditMemory = () => {
    setEditMemory({
      summary: memory?.summary || '',
      key_events: memory?.key_events || [],
      entities: memory?.entities || { characters: [], locations: [], items: [], organizations: [] },
      facts: memory?.facts || [],
      state_changes: memory?.state_changes || [],
      open_threads: memory?.open_threads || [],
    });
    setMemoryMode('edit');
  };

  const handleSaveMemory = async () => {
    setSavingMemory(true);
    try {
      const res = await chapterApi.updateMemory(id, editMemory);
      setMemory(res.data);
      setMemoryMode('read');
      feedback.success('记忆卡已保存。');
    } catch (error) {
      feedback.error(error.response?.data?.error || '保存失败');
    } finally {
      setSavingMemory(false);
    }
  };

  const handleCancelMemory = () => {
    setEditMemory(null);
    setMemoryMode('read');
  };

  const handleRegenerateMemory = async () => {
    const confirmed = await feedback.confirm({
      title: '重新提取记忆卡？',
      message: 'AI 会重新读取本章正文并提取记忆卡，当前手动编辑的内容会被覆盖。',
      confirmText: '重新提取',
      cancelText: '取消',
      variant: 'danger',
    });
    if (!confirmed) return;
    setRegeneratingMemory(true);
    try {
      const res = await chapterApi.regenerateMemory(id);
      setMemory(res.data);
      setMemoryMode('read');
      feedback.success('记忆卡已重新提取。');
    } catch (error) {
      feedback.error(error.response?.data?.error || '提取失败');
    } finally {
      setRegeneratingMemory(false);
    }
  };

  const handleEditArchitecture = () => {
    setArchitecturePlotOutline(architecture?.plot_outline || '');
    setEditingArchitecture(true);
  };

  const handleCancelArchitectureEdit = () => {
    setArchitecturePlotOutline(architecture?.plot_outline || '');
    setEditingArchitecture(false);
  };

  const handleSaveArchitecture = async () => {
    if (!architecture?.id) return;
    setSavingArchitecture(true);
    try {
      const res = await architectureApi.update(architecture.id, {
        title: architecture.title,
        plotOutline: architecturePlotOutline,
      });
      setArchitecture(res.data);
      setArchitecturePlotOutline(res.data?.plot_outline || '');
      setEditingArchitecture(false);
      feedback.success('本章架构情节概要已保存。');
    } catch (error) {
      console.error('保存本章架构失败:', error);
      feedback.error(error.response?.data?.error || '保存失败，请稍后再试。');
    } finally {
      setSavingArchitecture(false);
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
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-slate-500">
        正在加载章节详情...
      </div>
    );
  }

  if (!chapter) {
    return <div className="py-20 text-center text-slate-500">章节不存在</div>;
  }

  return (
    <>
      <PageShell
        eyebrow="Chapter Studio"
        title={chapter.title || `第 ${chapter.chapter_number} 章`}
        description="先读，再决定是重生成、局部改写，还是直接回滚版本。把这些动作放到同一页里，避免打断写作节奏。"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" asChild>
                  <Link to={`/novels/${chapter.novel_id}/architecture`} className="flex items-center justify-center">
                    <ArrowLeft className="mr-1.5 size-4" />
                    返回
                  </Link>
                </Button>
              </TooltipTrigger>
              <TooltipContent>返回完整架构页</TooltipContent>
            </Tooltip>
            <div className="h-4 w-px bg-border" />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" onClick={handleCopy}>
                  <Copy className="mr-1.5 size-4" />
                  复制
                </Button>
              </TooltipTrigger>
              <TooltipContent>复制章节正文到剪贴板</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" onClick={() => setShowPublishDialog(true)} disabled={!chapter?.content}>
                  <Upload className="mr-1.5 size-4" />
                  发布
                </Button>
              </TooltipTrigger>
              <TooltipContent>发布章节到小说平台</TooltipContent>
            </Tooltip>
            {mode === 'read' && (
              <Button size="sm" onClick={() => setMode('edit')}>
                <Edit3 className="mr-1.5 size-4" />
                编辑
              </Button>
            )}
            {nextChapter ? (
              <Button size="sm" variant="outline" asChild>
                <Link to={`/chapters/${nextChapter.id}`} className="flex items-center justify-center">
                  下一章
                  <ChevronRight className="ml-1.5 size-4" />
                </Link>
              </Button>
            ) : null}
          </div>
        }
      >
        <StatGrid items={stats} />

        {architecture && (
          <SectionCard
            title="本章架构"
            description="生成正文时所参考的章节架构信息，包括情节概要与人物设定。"
            actions={
              editingArchitecture ? (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleCancelArchitectureEdit}>
                    <X className="size-4" />
                    取消
                  </Button>
                  <Button size="sm" onClick={handleSaveArchitecture} disabled={savingArchitecture}>
                    <Save className="size-4" />
                    {savingArchitecture ? '保存中...' : '保存概要'}
                  </Button>
                </div>
              ) : (
                <Button size="sm" variant="outline" onClick={handleEditArchitecture}>
                  <Edit3 className="size-4" />
                  编辑概要
                </Button>
              )
            }
          >
            <div className="space-y-4">
              {(architecture.plot_outline || editingArchitecture) && (
                <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4">
                  <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
                    <BookOpen className="size-4 text-slate-500" />
                    情节概要
                  </div>
                  {editingArchitecture ? (
                    <Textarea
                      value={architecturePlotOutline}
                      onChange={(event) => setArchitecturePlotOutline(event.target.value)}
                      rows={10}
                      className="text-sm leading-7"
                      placeholder="输入本章架构的情节概要..."
                    />
                  ) : (
                    <p className="text-sm leading-7 text-slate-600 whitespace-pre-wrap">
                      {architecture.plot_outline}
                    </p>
                  )}
                </div>
              )}
              {(() => {
                let chars = null;
                try { chars = typeof architecture.characters === 'string' ? JSON.parse(architecture.characters) : architecture.characters; } catch { /* ignore */ }
                if (!chars || (typeof chars === 'object' && !Array.isArray(chars) && Object.keys(chars).length === 0)) return null;
                const list = Array.isArray(chars) ? chars : Object.values(chars);
                if (!list.length) return null;
                return (
                  <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4">
                    <p className="mb-3 text-sm font-semibold text-slate-700">本章人物</p>
                    <div className="flex flex-wrap gap-2">
                      {list.map((c, i) => (
                        <Badge key={i} variant="outline" className="text-xs">
                          {typeof c === 'string' ? c : (c.name || JSON.stringify(c))}
                        </Badge>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          </SectionCard>
        )}

        {/* 记忆卡 */}
        <SectionCard
          title="记忆卡"
          description="AI 从本章正文提取的结构化信息，用于跨章节逻辑审核。可手动修正或重新提取。"
          actions={
            memoryMode === 'read' ? (
              <div className="flex gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="sm" onClick={handleRegenerateMemory} disabled={regeneratingMemory}>
                      <RefreshCw className="size-4" />
                      {regeneratingMemory ? '提取中...' : memory ? '重新提取' : '生成记忆卡'}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{memory ? 'AI 重新读取正文提取记忆卡' : '为当前章节生成结构化记忆卡'}</TooltipContent>
                </Tooltip>
                {memory ? (
                  <Button size="sm" onClick={handleEditMemory}>
                    <Edit3 className="size-4" />
                    编辑
                  </Button>
                ) : null}
              </div>
            ) : memory && memoryMode === 'edit' ? (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleCancelMemory}>
                  <X className="size-4" />取消
                </Button>
                <Button size="sm" onClick={handleSaveMemory} disabled={savingMemory}>
                  <Save className="size-4" />
                  {savingMemory ? '保存中...' : '保存'}
                </Button>
              </div>
            ) : null
          }
        >
          {!memory ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
              <Brain className="mx-auto mb-2 size-8 text-slate-400" />
              还没有记忆卡。生成或保存章节正文后会自动提取。
            </div>
          ) : memoryMode === 'read' ? (
            <div className="space-y-3">
              {memory.key_events?.length > 0 && (
                <div className="rounded-lg border border-indigo-200 bg-indigo-50/60 p-4">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-indigo-600">本章关键事件</p>
                  <div className="space-y-2">
                    {memory.key_events.map((e, i) => (
                      <div key={i} className="flex items-start gap-3 text-sm">
                        <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-600">{i + 1}</span>
                        <div className="min-w-0 flex-1">
                          <span className="font-medium text-slate-800">{e.event}</span>
                          {e.characters?.length > 0 && (
                            <span className="ml-2 text-slate-500">
                              {e.characters.join('、')}
                            </span>
                          )}
                          {e.time && (
                            <Badge variant="outline" className="ml-2 text-xs text-slate-400">{e.time}</Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {memory.summary && (
                <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-slate-500">概要</p>
                  <p className="text-sm leading-7 text-slate-700">{memory.summary}</p>
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                {['characters', 'locations', 'items', 'organizations'].map((key) => {
                  const labels = { characters: '人物', locations: '地点', items: '物品', organizations: '组织' };
                  const list = memory.entities?.[key] || [];
                  if (!list.length) return null;
                  return (
                    <div key={key} className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-500">{labels[key]}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {list.map((item, i) => (
                          <Badge key={i} variant="outline" className="text-xs">{item}</Badge>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
              {memory.state_changes?.length > 0 && (
                <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-500">状态变化</p>
                  <div className="space-y-1">
                    {memory.state_changes.map((s, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm text-slate-600">
                        <Badge variant="outline" className="text-xs shrink-0">{s.entity}</Badge>
                        <span className="text-slate-400">{s.from ?? '?'}</span>
                        <ChevronRight className="size-3 text-slate-400 shrink-0" />
                        <span className="text-slate-700 font-medium">{s.to ?? '?'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {memory.facts?.length > 0 && (
                <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-500">事实</p>
                  <div className="space-y-1">
                    {memory.facts.map((f, i) => (
                      <p key={i} className="text-sm text-slate-600">
                        <span className="font-medium text-slate-800">{f.subject}</span>
                        {' '}{f.predicate}{' '}
                        <span className="text-slate-700">{f.object}</span>
                      </p>
                    ))}
                  </div>
                </div>
              )}
              {memory.open_threads?.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-amber-600">未解悬念</p>
                  <div className="space-y-1">
                    {memory.open_threads.map((t, i) => (
                      <p key={i} className="text-sm text-amber-800">{t.thread ?? t}</p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* 编辑模式 */
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-widest text-slate-500">概要</Label>
                <Textarea
                  value={editMemory.summary}
                  onChange={(e) => setEditMemory({ ...editMemory, summary: e.target.value })}
                  rows={3}
                  className="text-sm"
                />
              </div>
              {['characters', 'locations', 'items', 'organizations'].map((key) => {
                const labels = { characters: '人物', locations: '地点', items: '物品', organizations: '组织' };
                return (
                  <div key={key} className="space-y-2">
                    <Label className="text-xs font-semibold uppercase tracking-widest text-slate-500">{labels[key]}（逗号分隔）</Label>
                    <Input
                      value={(editMemory.entities?.[key] || []).join('、')}
                      onChange={(e) => setEditMemory({
                        ...editMemory,
                        entities: {
                          ...editMemory.entities,
                          [key]: e.target.value.split(/[,，、]/).map(s => s.trim()).filter(Boolean),
                        },
                      })}
                      className="text-sm"
                    />
                  </div>
                );
              })}
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-widest text-slate-500">状态变化（JSON 数组）</Label>
                <Textarea
                  value={JSON.stringify(editMemory.state_changes || [], null, 2)}
                  onChange={(e) => {
                    try { setEditMemory({ ...editMemory, state_changes: JSON.parse(e.target.value) }); } catch { /* ignore invalid JSON */ }
                  }}
                  rows={4}
                  className="font-mono text-xs"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-widest text-slate-500">事实（JSON 数组）</Label>
                <Textarea
                  value={JSON.stringify(editMemory.facts || [], null, 2)}
                  onChange={(e) => {
                    try { setEditMemory({ ...editMemory, facts: JSON.parse(e.target.value) }); } catch { /* ignore invalid JSON */ }
                  }}
                  rows={6}
                  className="font-mono text-xs"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-widest text-slate-500">未解悬念（JSON 数组）</Label>
                <Textarea
                  value={JSON.stringify(editMemory.open_threads || [], null, 2)}
                  onChange={(e) => {
                    try { setEditMemory({ ...editMemory, open_threads: JSON.parse(e.target.value) }); } catch { /* ignore invalid JSON */ }
                  }}
                  rows={3}
                  className="font-mono text-xs"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-widest text-slate-500">关键事件（JSON 数组）</Label>
                <Textarea
                  value={JSON.stringify(editMemory.key_events || [], null, 2)}
                  onChange={(e) => {
                    try { setEditMemory({ ...editMemory, key_events: JSON.parse(e.target.value) }); } catch { /* ignore invalid JSON */ }
                  }}
                  rows={5}
                  className="font-mono text-xs"
                  placeholder='[{"event": "林霄发现玄铁佩", "characters": ["林霄"], "time": "入夜"}]'
                />
              </div>
            </div>
          )}
        </SectionCard>

        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <SectionCard
            title="生成与回看"
            description="先决定要不要重新出稿，再进入精修，避免边写边犹豫。"
          >
            <div className="space-y-4">
              <Card className="border-slate-200 bg-slate-50/70">
                <CardContent className="p-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-slate-800">AI 生成草稿</p>
                      <div className="flex items-center gap-2">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              onClick={handleReview}
                              disabled={reviewing || !chapter?.content}
                              size="sm"
                            >
                              <AlertTriangle className="mr-1.5 size-4" />
                              {reviewing ? '审阅中...' : '重新审阅'}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>基于历史章节和证据重新检查硬逻辑冲突</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              onClick={handleGenerate}
                              disabled={generating}
                              size="sm"
                            >
                              <Sparkles className="mr-1.5 size-4" />
                              {generating ? '生成中...' : '生成'}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>生成章节正文</TooltipContent>
                        </Tooltip>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {chapter.architecture_id ? (
                <Alert className="border-amber-200 bg-amber-50/70">
                  <AlertTriangle className="size-4 text-amber-600" />
                  <AlertTitle className="text-amber-900">按架构重新生成</AlertTitle>
                  <AlertDescription className="text-amber-800/80">
                    当前章节已绑定架构，可以直接按结构重新出稿，更适合大幅跑偏后的回正。
                  </AlertDescription>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRegenerate}
                    disabled={regenerating}
                    className="mt-3 border-amber-300 bg-amber-100 hover:bg-amber-200 text-amber-900"
                  >
                    <RefreshCw className="size-4" />
                    {regenerating ? '重新生成中...' : '按架构重新生成'}
                  </Button>
                </Alert>
              ) : null}

              {review ? (
                <Alert
                  className={cn(
                    review.score >= 70
                      ? 'border-emerald-200 bg-emerald-50/70'
                      : 'border-amber-200 bg-amber-50/70'
                  )}
                >
                  {review.score >= 70 ? (
                    <CheckCircle className="size-4 text-emerald-600" />
                  ) : (
                    <AlertTriangle className="size-4 text-amber-600" />
                  )}
                  <AlertTitle className="flex items-center justify-between">
                    <span>AI 审核报告</span>
                    <div className="flex items-center gap-2">
                      {(review.issues?.length || review.notes?.length) ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleRevise}
                          disabled={revising}
                        >
                          <FileText className="mr-1.5 size-4" />
                          {revising ? '处理中...' : '按审核结果重新生成正文'}
                        </Button>
                      ) : null}
                      <Badge
                        variant={review.score >= 70 ? 'default' : 'secondary'}
                        className={cn(
                          review.score >= 70
                            ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100'
                            : 'bg-amber-100 text-amber-700 hover:bg-amber-100'
                        )}
                      >
                        评分 {review.score}
                      </Badge>
                    </div>
                  </AlertTitle>
                  <AlertDescription>
                    {(review.issues?.length || review.notes?.length) ? (
                      <div className="mt-3 rounded-lg border border-slate-200 bg-white/80 px-3 py-3">
                        <Label htmlFor="revise-idea" className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">
                          你对这一章的补充想法
                        </Label>
                        <Textarea
                          id="revise-idea"
                          value={reviseIdea}
                          onChange={(event) => setReviseIdea(event.target.value)}
                          placeholder="例如：保留这一章压抑的氛围；不要大改前半段；把主角的动机写得更坚定一些。"
                          className="mt-2 min-h-24 bg-white"
                        />
                      </div>
                    ) : null}
                    {review.issues?.length ? (
                      <div className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
                        {review.issues.map((issue, index) => (
                          <div
                            key={`${issue.type}-${index}`}
                            className="rounded-lg bg-white/80 px-3 py-2"
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-semibold text-rose-600">{issueTypeLabel(issue.type)}</span>
                              {issue.severity ? (
                                <Badge variant="outline">{issue.severity}</Badge>
                              ) : null}
                              {issue.historicalChapterNumber ? (
                                <Badge variant="outline">第 {issue.historicalChapterNumber} 章</Badge>
                              ) : null}
                            </div>
                            <p className="mt-1">{issue.description}</p>
                            {issue.currentEvidence ? (
                              <div className="mt-2 rounded-lg border border-amber-200/80 bg-amber-50/80 px-3 py-2 text-slate-700">
                                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">
                                  当前章证据
                                </p>
                                <p className="mt-1">{issue.currentEvidence}</p>
                              </div>
                            ) : null}
                            {issue.historicalEvidence ? (
                              <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-slate-700">
                                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">
                                  历史章证据
                                </p>
                                <p className="mt-1">{issue.historicalEvidence}</p>
                              </div>
                            ) : null}
                            {issue.suggestion ? (
                              <p className="mt-1 text-slate-500">建议：{issue.suggestion}</p>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        这次生成没有发现明显问题，可以直接进入人工润色。
                      </p>
                    )}
                    {review.notes?.length ? (
                      <div className="mt-3 space-y-2 rounded-lg border border-slate-200 bg-white/80 px-3 py-3 text-sm text-slate-600">
                        <div className="flex items-center gap-2 font-medium text-slate-800">
                          <Info className="size-4" />
                          架构提示
                        </div>
                        {review.notes.map((note, index) => (
                          <p key={`${note}-${index}`}>{note}</p>
                        ))}
                      </div>
                    ) : null}
                  </AlertDescription>
                </Alert>
              ) : null}

            </div>
          </SectionCard>

          <SectionCard
            title="版本历史"
            description="回退动作应当在阅读态就清晰可见，而不是必须先进入编辑态。"
          >
            {versions.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                <History className="mx-auto mb-2 size-8 text-slate-400" />
                还没有历史版本。第一次保存或重新生成后，这里会开始积累回退记录。
              </div>
            ) : (
              <ScrollArea className="h-[300px] pr-4">
                <div className="space-y-2">
                  {versions.map((version) => (
                    <div
                      key={version.id}
                      className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 transition-colors hover:bg-slate-100/70"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-900">
                          版本 {version.version_number}
                        </p>
                        <p className="text-xs text-slate-500">
                          {new Date(version.created_at).toLocaleString()}
                        </p>
                      </div>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs shrink-0"
                            onClick={() => handleRestore(version.version_number)}
                          >
                            <History className="mr-1 size-3" />
                            恢复
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>恢复到此版本</TooltipContent>
                      </Tooltip>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </SectionCard>
        </div>

        <SectionCard
          title={mode === 'edit' ? '精修工作区' : '阅读视图'}
          description={
            mode === 'edit'
              ? '专注编辑，可切换到阅读视图查看效果。'
              : '先通读整章，再判断是继续润色、重生成，还是回退旧版本。'
          }
          actions={
            mode === 'edit' ? (
              <>
                <Button variant="outline" onClick={handleCancel}>
                  <X className="size-4" />
                  取消编辑
                </Button>
                <Button variant="outline" onClick={() => handleSave({ regenerateMemory: false })} disabled={saving}>
                  <Save className="size-4" />
                  {saving ? '保存中...' : '保存'}
                </Button>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <Button onClick={() => handleSave({ regenerateMemory: true })} disabled={saving}>
                        <Save className="size-4" />
                        {saving ? '保存中...' : '保存并更新记忆'}
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    保存章节并重新生成记忆卡
                  </TooltipContent>
                </Tooltip>
              </>
            ) : (
              <Button variant="outline" onClick={() => setMode('edit')}>
                <Edit3 className="size-4" />
                开始润色
              </Button>
            )
          }
        >
          {mode === 'edit' ? (
            <div className="space-y-3">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>章节标题</Label>
                  {hasUnsavedChanges && (
                    <Badge variant="secondary" className="text-xs">
                      未保存
                    </Badge>
                  )}
                </div>
                <Input
                  value={editTitle}
                  onChange={(event) => setEditTitle(event.target.value)}
                  placeholder="输入章节标题"
                  className="text-lg font-semibold"
                />
              </div>
              <div className="space-y-2 flex-1 flex flex-col min-h-0">
                <Label>正文内容</Label>
                <div className="flex-1 min-h-0 rounded-md border border-slate-200 overflow-hidden">
                  <MarkdownEditor
                    value={editContent}
                    onChange={setEditContent}
                    placeholder="在这里撰写章节内容，支持 Markdown。"
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  <FileText className="mr-1 size-3" />
                  第 {chapter.chapter_number} 章
                </Badge>
                <Badge variant={statusVariant(chapter.status)}>{statusLabel(chapter.status)}</Badge>
                {hasUnsavedChanges && (
                  <Badge variant="secondary" className="bg-amber-100 text-amber-700">
                    有未保存修改
                  </Badge>
                )}
              </div>
              <ScrollArea className="max-h-[600px] overflow-auto">
                <div className="prose prose-slate max-w-none pr-3 leading-7">
                  <ReactMarkdown>
                    {chapter.content || '*暂无内容，点击上方按钮开始生成或编辑正文。*'}
                  </ReactMarkdown>
                </div>
              </ScrollArea>
            </div>
          )}
        </SectionCard>
      </PageShell>

      <PublishDialog
        open={showPublishDialog}
        onClose={() => setShowPublishDialog(false)}
        chapterId={chapter?.id}
        chapterTitle={chapter?.title || '未命名章节'}
        publishResult={chapter?.publish_result}
      />
    </>
  );
}

export default ChapterDetail;
