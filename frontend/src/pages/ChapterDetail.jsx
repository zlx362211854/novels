import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { chapterApi, architectureApi } from '../services/api';
import PublishDialog from '../components/PublishDialog';
import ChapterDiffView from '../components/ChapterDiffView';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { cn } from '@/lib/utils';
import { buildNextChapterDraft, summarizeMemory, summarizeReview } from '@/lib/chapterWorkspace';
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
  Clock3,
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
  const navigate = useNavigate();
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
  const [reviewing, setReviewing] = useState(false);
  const [revising, setRevising] = useState(false);
  const [tuning, setTuning] = useState(false);
  const [tuneDraft, setTuneDraft] = useState(null);
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
  const [generatePrompt, setGeneratePrompt] = useState('');
  const [tunePrompt, setTunePrompt] = useState('');
  const [nextChapter, setNextChapter] = useState(null);
  const [generatingNextChapter, setGeneratingNextChapter] = useState(false);

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

  const memorySummary = useMemo(() => summarizeMemory(memory), [memory]);
  const reviewSummary = useMemo(() => summarizeReview(review), [review]);

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
      const res = await chapterApi.generate(id, generatePrompt);
      setChapter(res.data.chapter);
      setEditContent(res.data.chapter.content || '');
      setEditTitle(res.data.chapter.title || '');
      setReview(res.data.review);
      setGeneratePrompt('');
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

  const handleGenerateNextChapter = async () => {
    if (!chapter?.novel_id) {
      feedback.warning('当前章节缺少小说信息，无法创建下一章。');
      return;
    }

    const confirmed = await feedback.confirm({
      title: '生成下一章？',
      message: `系统会创建第 ${(chapter.chapter_number || 0) + 1} 章，并立即调用 AI 生成正文。`,
      confirmText: '生成下一章',
      cancelText: '先不生成',
    });
    if (!confirmed) return;

    setGeneratingNextChapter(true);
    try {
      let nextArchitecture = null;
      if (chapter.architecture_id && architecture?.parent_id) {
        const archRes = await architectureApi.getByNovelId(chapter.novel_id);
        const siblingArchs = archRes.data
          .filter((arch) => arch.level === 'chapter' && arch.parent_id === architecture.parent_id)
          .sort((left, right) => (left.id || 0) - (right.id || 0));
        const currentArchIndex = siblingArchs.findIndex((arch) => arch.id === chapter.architecture_id);
        nextArchitecture = currentArchIndex >= 0 ? siblingArchs[currentArchIndex + 1] || null : null;
      }

      const createRes = await chapterApi.create(
        chapter.novel_id,
        buildNextChapterDraft(chapter, nextArchitecture)
      );
      const createdChapter = createRes.data;
      const generateRes = await chapterApi.generate(createdChapter.id);
      const generatedChapter = generateRes.data?.chapter || createdChapter;
      setNextChapter(generatedChapter);
      feedback.success(`第 ${generatedChapter.chapter_number || createdChapter.chapter_number} 章已生成。`);
      navigate(`/chapters/${generatedChapter.id || createdChapter.id}`);
    } catch (error) {
      console.error('生成下一章失败:', error);
      feedback.error(error.response?.data?.error || '生成下一章失败，请稍后再试。');
    } finally {
      setGeneratingNextChapter(false);
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

  const handleTune = async () => {
    if (!chapter?.content) {
      feedback.warning('当前还没有可微调的正文。');
      return;
    }
    if (!tunePrompt.trim()) {
      feedback.warning('请先填写微调要求。');
      return;
    }

    setTuning(true);
    try {
      const res = await chapterApi.tune(id, tunePrompt);
      setTuneDraft(res.data);
      setTunePrompt('');
      feedback.success('微调草稿已生成，请先查看差异。');
    } catch (error) {
      console.error('章节微调失败:', error);
      feedback.error(error.response?.data?.error || '章节微调失败，请稍后再试。');
    } finally {
      setTuning(false);
    }
  };

  const handleApplyTuneDraft = () => {
    if (!tuneDraft) return;
    setEditContent(tuneDraft.revisedContent || '');
    setEditTitle(chapter.title || '');
    setReview(null);
    setMode('edit');
    setTuneDraft(null);
    feedback.success('微调稿已放入编辑区。确认无误后，请点击保存。');
  };

  const handleDiscardTuneDraft = async () => {
    const confirmed = await feedback.confirm({
      title: '丢弃微调草稿？',
      message: '丢弃后不会修改当前章节正文，也不会影响历史版本。',
      confirmText: '丢弃草稿',
      cancelText: '继续查看',
      variant: 'danger',
    });
    if (!confirmed) return;
    setTuneDraft(null);
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
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={handleGenerateNextChapter}
                disabled={generatingNextChapter}
              >
                <Sparkles className="mr-1.5 size-4" />
                {generatingNextChapter ? '生成中...' : '生成下一章'}
              </Button>
            )}
          </div>
        }
      >
        <StatGrid items={stats} />

        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_390px]">
          <div className="space-y-6">
            <SectionCard
              title="AI 助手"
              description="生成、审阅、重写和微调集中在这里，正文仍然由下方工作区确认。"
            >
              <div className="space-y-4">
                <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
                    <div className="min-w-0 flex-1 space-y-2">
                      <Label htmlFor="generate-prompt" className="text-sm font-semibold text-slate-800">
                        生成正文要求
                      </Label>
                      <Textarea
                        id="generate-prompt"
                        value={generatePrompt}
                        onChange={(event) => setGeneratePrompt(event.target.value)}
                        rows={3}
                        className="bg-white"
                        placeholder="可选：例如承接上一章紧张气氛；重点写主角犹豫后下定决心；不要提前揭露幕后人。"
                        disabled={generating}
                      />
                    </div>
                    <Button onClick={handleGenerate} disabled={generating} className="lg:mb-0.5">
                      <Sparkles className="size-4" />
                      {generating ? '生成中...' : '生成正文'}
                    </Button>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    生成正文会覆盖当前章节内容；填写要求后会随本章架构一起发给 AI。
                  </p>
                </div>

                <div className="grid gap-3 md:grid-cols-1">
                  <Button variant="outline" onClick={handleReview} disabled={reviewing || !chapter?.content}>
                    <AlertTriangle className="size-4" />
                    {reviewing ? '审阅中...' : '重新审阅'}
                  </Button>
                </div>

                <div className="rounded-lg border border-sky-200 bg-sky-50/70 p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
                    <div className="min-w-0 flex-1 space-y-2">
                      <Label htmlFor="tune-prompt" className="text-sm font-semibold text-slate-800">
                        局部微调要求
                      </Label>
                      <Textarea
                        id="tune-prompt"
                        value={tunePrompt}
                        onChange={(event) => setTunePrompt(event.target.value)}
                        rows={3}
                        className="bg-white"
                        placeholder="例如：加强结尾悬念；把对话写得更含蓄；减少现代口语。"
                        disabled={tuning}
                      />
                    </div>
                    <Button
                      onClick={handleTune}
                      disabled={tuning || !chapter?.content || !tunePrompt.trim()}
                      className="lg:mb-0.5"
                    >
                      <Sparkles className="size-4" />
                      {tuning ? '微调中...' : '生成微调草稿'}
                    </Button>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    微调会先生成 diff 草稿；应用到编辑区后，还需要保存。
                  </p>
                </div>
              </div>
            </SectionCard>

            <SectionCard
              title={tuneDraft ? '微调草稿' : mode === 'edit' ? '精修工作区' : '阅读视图'}
              description={
                tuneDraft
                  ? '先看差异，再决定是否放入编辑区。'
                  : mode === 'edit'
                    ? '正文编辑区已固定高度，长章节也可以稳定滚动。'
                    : '正文现在是主工作区，周边信息收进右侧上下文。'
              }
              actions={
                mode === 'edit' && !tuneDraft ? (
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
                      <TooltipContent>保存章节并重新生成记忆卡</TooltipContent>
                    </Tooltip>
                  </>
                ) : !tuneDraft ? (
                  <Button variant="outline" onClick={() => setMode('edit')}>
                    <Edit3 className="size-4" />
                    开始润色
                  </Button>
                ) : null
              }
            >
              {tuneDraft ? (
                <ChapterDiffView
                  originalContent={tuneDraft.originalContent || chapter.content || ''}
                  revisedContent={tuneDraft.revisedContent || ''}
                  summary={tuneDraft.summary || '微调草稿待确认：应用到编辑区后，再用右上角保存按钮真正写入数据库。'}
                  chapterNumber={tuneDraft.chapterNumber || chapter.chapter_number}
                  title={tuneDraft.chapterTitle || chapter.title}
                  onAccept={handleApplyTuneDraft}
                  onSkip={handleDiscardTuneDraft}
                  acceptLabel="应用到编辑区"
                  skipLabel="丢弃草稿"
                  variant="unified"
                  isLast
                  currentIndex={0}
                  totalCount={1}
                />
              ) : mode === 'edit' ? (
                <div className="flex min-h-[680px] flex-col gap-3">
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
                  <div className="flex min-h-0 flex-1 flex-col space-y-2">
                    <Label>正文内容</Label>
                    <div className="min-h-0 flex-1 overflow-hidden rounded-md border border-slate-200">
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
                    {reviewSummary.hasReview ? (
                      <Badge
                        variant="outline"
                        className={cn(
                          reviewSummary.status === 'healthy'
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                            : 'border-amber-200 bg-amber-50 text-amber-700'
                        )}
                      >
                        {reviewSummary.issueCount > 0 ? `审核 ${reviewSummary.issueCount} 个问题` : '审核通过'}
                      </Badge>
                    ) : null}
                    {hasUnsavedChanges && (
                      <Badge variant="secondary" className="bg-amber-100 text-amber-700">
                        有未保存修改
                      </Badge>
                    )}
                  </div>
                  <ScrollArea className="max-h-[760px] overflow-auto">
                    <div className="prose prose-slate max-w-none pr-3 leading-7">
                      <ReactMarkdown>
                        {chapter.content || '*暂无内容，点击上方按钮开始生成或编辑正文。*'}
                      </ReactMarkdown>
                    </div>
                  </ScrollArea>
                </div>
              )}
            </SectionCard>
          </div>

          <aside className="space-y-4 xl:sticky xl:top-20 xl:max-h-[calc(100vh-6rem)] xl:overflow-hidden">
            <Card className="border-border/70 bg-white shadow-sm">
              <CardContent className="p-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                    <p className="text-xs text-slate-500">记忆卡</p>
                    <p className="mt-1 text-lg font-semibold text-slate-900">
                      {memorySummary.hasMemory ? `${memorySummary.keyEventCount} 事件` : '未生成'}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                    <p className="text-xs text-slate-500">审核</p>
                    <p className="mt-1 text-lg font-semibold text-slate-900">
                      {reviewSummary.hasReview ? `${reviewSummary.issueCount} 问题` : '未审阅'}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                    <p className="text-xs text-slate-500">实体</p>
                    <p className="mt-1 text-lg font-semibold text-slate-900">{memorySummary.entityCount}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                    <p className="text-xs text-slate-500">版本</p>
                    <p className="mt-1 text-lg font-semibold text-slate-900">{versions.length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Tabs defaultValue="architecture" className="min-h-0 rounded-lg border border-border bg-white p-3 shadow-sm xl:max-h-[calc(100vh-18rem)]">
              <TabsList className="grid h-auto w-full grid-cols-4">
                <TabsTrigger value="architecture" className="px-2 text-xs">架构</TabsTrigger>
                <TabsTrigger value="memory" className="px-2 text-xs">记忆</TabsTrigger>
                <TabsTrigger value="review" className="px-2 text-xs">审核</TabsTrigger>
                <TabsTrigger value="versions" className="px-2 text-xs">版本</TabsTrigger>
              </TabsList>

              <TabsContent value="architecture" className="mt-4">
                {!architecture ? (
                  <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                    暂无关联架构。
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">本章架构</p>
                        <p className="text-xs text-slate-500">生成正文时的情节依据</p>
                      </div>
                      {editingArchitecture ? (
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={handleCancelArchitectureEdit}>
                            <X className="size-4" />
                          </Button>
                          <Button size="sm" onClick={handleSaveArchitecture} disabled={savingArchitecture}>
                            <Save className="size-4" />
                          </Button>
                        </div>
                      ) : (
                        <Button size="sm" variant="outline" onClick={handleEditArchitecture}>
                          <Edit3 className="size-4" />
                          编辑
                        </Button>
                      )}
                    </div>
                    {editingArchitecture ? (
                      <Textarea
                        value={architecturePlotOutline}
                        onChange={(event) => setArchitecturePlotOutline(event.target.value)}
                        rows={12}
                        className="text-sm leading-7"
                        placeholder="输入本章架构的情节概要..."
                      />
                    ) : (
                      <div className="max-h-[min(420px,calc(100vh-28rem))] overflow-auto rounded-lg border border-slate-200 bg-slate-50/70 p-4">
                        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
                          <BookOpen className="size-4 text-slate-500" />
                          情节概要
                        </div>
                        <p className="whitespace-pre-wrap text-sm leading-7 text-slate-600">
                          {architecture.plot_outline || '暂无情节概要。'}
                        </p>
                      </div>
                    )}
                    {(() => {
                      let chars = null;
                      try { chars = typeof architecture.characters === 'string' ? JSON.parse(architecture.characters) : architecture.characters; } catch { /* ignore */ }
                      if (!chars || (typeof chars === 'object' && !Array.isArray(chars) && Object.keys(chars).length === 0)) return null;
                      const list = Array.isArray(chars) ? chars : Object.values(chars);
                      if (!list.length) return null;
                      return (
                        <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-500">本章人物</p>
                          <div className="flex flex-wrap gap-1.5">
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
                )}
              </TabsContent>

              <TabsContent value="memory" className="mt-4">
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">记忆卡</p>
                      <p className="text-xs text-slate-500">
                        {memorySummary.hasMemory
                          ? `${memorySummary.keyEventCount} 事件 / ${memorySummary.entityCount} 实体 / ${memorySummary.openThreadCount} 悬念`
                          : '还没有结构化记忆'}
                      </p>
                    </div>
                    {memoryMode === 'read' ? (
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={handleRegenerateMemory} disabled={regeneratingMemory}>
                          <RefreshCw className="size-4" />
                        </Button>
                        {memory ? (
                          <Button size="sm" onClick={handleEditMemory}>
                            <Edit3 className="size-4" />
                          </Button>
                        ) : null}
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={handleCancelMemory}>
                          <X className="size-4" />
                        </Button>
                        <Button size="sm" onClick={handleSaveMemory} disabled={savingMemory}>
                          <Save className="size-4" />
                        </Button>
                      </div>
                    )}
                  </div>

                  {!memory ? (
                    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                      <Brain className="mx-auto mb-2 size-8 text-slate-400" />
                      生成或保存章节正文后会自动提取。
                    </div>
                  ) : memoryMode === 'read' ? (
                    <ScrollArea className="h-[min(620px,calc(100vh-24rem))] pr-3">
                      <div className="space-y-3">
                        {memory.key_events?.length > 0 && (
                          <div className="rounded-lg border border-indigo-200 bg-indigo-50/60 p-4">
                            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-indigo-600">关键事件</p>
                            <div className="space-y-2">
                              {memory.key_events.map((e, i) => (
                                <div key={i} className="flex items-start gap-3 text-sm">
                                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-600">{i + 1}</span>
                                  <div className="min-w-0 flex-1">
                                    <span className="font-medium text-slate-800">{e.event}</span>
                                    {e.characters?.length > 0 && (
                                      <span className="ml-2 text-slate-500">{e.characters.join('、')}</span>
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
                        {memory.state_changes?.length > 0 && (
                          <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4">
                            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-500">状态变化</p>
                            <div className="space-y-1">
                              {memory.state_changes.map((s, i) => (
                                <div key={i} className="flex items-center gap-2 text-sm text-slate-600">
                                  <Badge variant="outline" className="shrink-0 text-xs">{s.entity}</Badge>
                                  <span className="text-slate-400">{s.from ?? '?'}</span>
                                  <ChevronRight className="size-3 shrink-0 text-slate-400" />
                                  <span className="font-medium text-slate-700">{s.to ?? '?'}</span>
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
                    </ScrollArea>
                  ) : (
                    <ScrollArea className="h-[min(620px,calc(100vh-24rem))] pr-3">
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
                        {[
                          ['state_changes', '状态变化（JSON 数组）', 4],
                          ['facts', '事实（JSON 数组）', 6],
                          ['open_threads', '未解悬念（JSON 数组）', 3],
                          ['key_events', '关键事件（JSON 数组）', 5],
                        ].map(([key, label, rows]) => (
                          <div key={key} className="space-y-2">
                            <Label className="text-xs font-semibold uppercase tracking-widest text-slate-500">{label}</Label>
                            <Textarea
                              value={JSON.stringify(editMemory[key] || [], null, 2)}
                              onChange={(e) => {
                                try { setEditMemory({ ...editMemory, [key]: JSON.parse(e.target.value) }); } catch { /* ignore invalid JSON */ }
                              }}
                              rows={rows}
                              className="font-mono text-xs"
                            />
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="review" className="mt-4">
                {!review ? (
                  <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                    <AlertTriangle className="mx-auto mb-2 size-8 text-slate-400" />
                    暂无审核报告。
                  </div>
                ) : (
                  <ScrollArea className="h-[min(660px,calc(100vh-24rem))] pr-3">
                    <div className="space-y-4">
                      <Alert
                        className={cn(
                          reviewSummary.status === 'healthy'
                            ? 'border-emerald-200 bg-emerald-50/70'
                            : 'border-amber-200 bg-amber-50/70'
                        )}
                      >
                        {reviewSummary.status === 'healthy' ? (
                          <CheckCircle className="size-4 text-emerald-600" />
                        ) : (
                          <AlertTriangle className="size-4 text-amber-600" />
                        )}
                        <AlertTitle className="flex items-center justify-between gap-3">
                          <span>{reviewSummary.issueCount > 0 ? `发现 ${reviewSummary.issueCount} 个问题` : '未发现明显问题'}</span>
                          {(review.issues?.length || review.notes?.length) ? (
                            <Button variant="outline" size="sm" onClick={handleRevise} disabled={revising}>
                              <FileText className="size-4" />
                              {revising ? '处理中...' : '按报告修订'}
                            </Button>
                          ) : null}
                        </AlertTitle>
                      </Alert>
                      {(review.issues?.length || review.notes?.length) ? (
                        <div className="rounded-lg border border-slate-200 bg-white px-3 py-3">
                          <Label htmlFor="revise-idea" className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">
                            补充修订想法
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
                        <div className="space-y-2 text-sm leading-6 text-slate-700">
                          {review.issues.map((issue, index) => (
                            <div key={`${issue.type}-${index}`} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-semibold text-rose-600">{issueTypeLabel(issue.type)}</span>
                                {issue.severity ? <Badge variant="outline">{issue.severity}</Badge> : null}
                                {issue.historicalChapterNumber ? <Badge variant="outline">第 {issue.historicalChapterNumber} 章</Badge> : null}
                              </div>
                              <p className="mt-1">{issue.description}</p>
                              {issue.currentEvidence ? (
                                <div className="mt-2 rounded-lg border border-amber-200/80 bg-amber-50/80 px-3 py-2 text-slate-700">
                                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">当前章证据</p>
                                  <p className="mt-1">{issue.currentEvidence}</p>
                                </div>
                              ) : null}
                              {issue.historicalEvidence ? (
                                <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-slate-700">
                                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">历史章证据</p>
                                  <p className="mt-1">{issue.historicalEvidence}</p>
                                </div>
                              ) : null}
                              {issue.suggestion ? <p className="mt-1 text-slate-500">建议：{issue.suggestion}</p> : null}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm leading-6 text-slate-600">这次生成没有发现明显问题，可以直接进入人工润色。</p>
                      )}
                      {review.notes?.length ? (
                        <div className="space-y-2 rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm text-slate-600">
                          <div className="flex items-center gap-2 font-medium text-slate-800">
                            <Info className="size-4" />
                            架构提示
                          </div>
                          {review.notes.map((note, index) => (
                            <p key={`${note}-${index}`}>{note}</p>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </ScrollArea>
                )}
              </TabsContent>

              <TabsContent value="versions" className="mt-4">
                {versions.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                    <History className="mx-auto mb-2 size-8 text-slate-400" />
                    还没有历史版本。
                  </div>
                ) : (
                  <ScrollArea className="h-[min(620px,calc(100vh-24rem))] pr-3">
                    <div className="space-y-2">
                      {versions.map((version) => (
                        <div
                          key={version.id}
                          className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 transition-colors hover:bg-slate-100/70"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-slate-900">版本 {version.version_number}</p>
                            <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                              <Clock3 className="size-3" />
                              {new Date(version.created_at).toLocaleString()}
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 shrink-0 px-2 text-xs"
                            onClick={() => handleRestore(version.version_number)}
                          >
                            <History className="mr-1 size-3" />
                            恢复
                          </Button>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </TabsContent>
            </Tabs>
          </aside>
        </div>
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
