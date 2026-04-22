import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { architectureApi, chapterApi } from '../services/api';
import PublishDialog from '../components/PublishDialog';
import { useFeedback } from '../components/ui/FeedbackProvider';
import JsonField from '../components/ui/JsonField';
import { PageShell, SectionCard, StatGrid } from '../components/ui/PageShell';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Loader2, Plus, Pencil, Trash2, Sparkles, FileText, ArrowLeft, ChevronDown, ChevronUp, Eye, RefreshCw, Upload } from 'lucide-react';

function ExpandableText({ text, maxLength = 120, className = '' }) {
  const [expanded, setExpanded] = useState(false);
  if (!text) return null;
  if (text.length <= maxLength) return <p className={className}>{text}</p>;
  return (
    <p className={className}>
      {expanded ? text : `${text.slice(0, maxLength)}…`}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="ml-1.5 text-xs font-medium text-slate-400 hover:text-slate-600"
      >
        {expanded ? '收起' : '展开'}
      </button>
    </p>
  );
}

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
  const [publishTarget, setPublishTarget] = useState(null); // { chapterId, chapterTitle, publishResult }
  const [expandedVolumes, setExpandedVolumes] = useState({});
  const [showReviewDialog, setShowReviewDialog] = useState(false);
  const [showReviewConfirmDialog, setShowReviewConfirmDialog] = useState(false);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewResult, setReviewResult] = useState(() => {
    // 从 localStorage 恢复审阅结果
    const saved = localStorage.getItem(`architecture-review-${id}`);
    return saved ? JSON.parse(saved) : null;
  });
  const [showRewriteDialog, setShowRewriteDialog] = useState(false);
  const [rewriteLoading, setRewriteLoading] = useState(false);
  const [rewritePrompt, setRewritePrompt] = useState('');
  const [rewriteResult, setRewriteResult] = useState(() => {
    const saved = localStorage.getItem(`architecture-rewrite-${id}`);
    return saved ? JSON.parse(saved) : null;
  });
  const [applyingChanges, setApplyingChanges] = useState(false);

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

  const closeBatchDialog = async () => {
    if (batchGenerating) {
      feedback.warning('正在生成中，请等待完成后再关闭。');
      return;
    }
    if (generatedChapters.length > 0) {
      const confirmed = await feedback.confirm({
        title: '草稿尚未保存',
        message: `已生成 ${generatedChapters.length} 条章架构草稿，关闭后将丢失。`,
        confirmText: '丢弃并关闭',
        cancelText: '继续编辑',
        variant: 'danger',
      });
      if (!confirmed) return;
      setGeneratedChapters([]);
    }
    setShowChapterBatch(false);
  };

  const getNextChapterNumber = (archId) => {
    const existing = chapters.find((chapter) => chapter.architecture_id === archId);
    if (existing) return existing.chapter_number;
    const max = chapters.reduce((result, chapter) => Math.max(result, chapter.chapter_number || 0), 0);
    return max + 1;
  };

  const toggleVolumeExpand = (volumeId) => {
    setExpandedVolumes((prev) => ({
      ...prev,
      [volumeId]: !prev[volumeId],
    }));
  };

  const startCreate = () => {
    setEditingId(null);
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
    setGenerating(true);
    try {
      const res = await architectureApi.generateByAi(id, {
        level: formData.level,
        parentId: formData.parentId,
        title: formData.title,
        plotOutline: formData.plotOutline,
      });
      const data = res.data || {};
      setFormData((current) => ({
        ...current,
        plotOutline: data.plot_outline || data.plotOutline || '',
        characters: JSON.stringify(data.characters || {}, null, 2),
        worldSetting: JSON.stringify(data.world_setting || data.worldSetting || {}, null, 2),
        emotionalTone: data.emotional_tone || data.emotionalTone || '',
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
    const levelLabel = arch.level === 'full' ? '全本架构' : arch.level === 'volume' ? '卷架构' : '章架构';
    const note = arch.level === 'full'
      ? '删除全本架构会同时移除所有关联信息，此操作不可恢复。'
      : arch.level === 'volume'
      ? '如果卷下还有章架构，删除后将一并移除，关联正文也会断开。'
      : undefined;

    // 第一次确认
    const first = await feedback.confirm({
      title: `删除「${arch.title}」？`,
      message: `即将删除这条${levelLabel}及其关联关系。`,
      note,
      confirmText: '继续',
      cancelText: '取消',
      variant: 'danger',
    });
    if (!first) return;

    // 第二次确认
    const second = await feedback.confirm({
      title: '再次确认删除',
      message: `「${arch.title}」删除后无法恢复，确定要继续吗？`,
      confirmText: '确认删除',
      cancelText: '我再想想',
      variant: 'danger',
    });
    if (!second) return;

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
      const normalized = (res.data || []).map((ch, i) => ({
        chapterNumber: ch.chapter_number ?? ch.chapterNumber ?? (i + 1),
        title: ch.title || '',
        plot_summary: ch.plot_summary || ch.summary || ch.plot_outline || ch.plotOutline || '',
      }));
      setGeneratedChapters(normalized);
      feedback.success(`已生成 ${normalized.length} 条章架构草稿。`);
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
      const chaptersToSave = generatedChapters.map((ch) => ({
        title: ch.title,
        plotOutline: ch.plot_summary || '',
      }));
      await architectureApi.batchCreateChapterArchitectures(id, selectedVolumeId, chaptersToSave);
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
      const generatedChapter = res.data?.chapter;
      if (!generatedChapter) {
        throw new Error('生成接口未返回章节数据');
      }

      feedback.success(`「${chapterArch.title}」已生成并保存为第 ${generatedChapter.chapter_number} 章。`);
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

  const handleReviewClick = () => {
    if (architectures.length === 0) {
      feedback.warning('请先创建至少一个架构。');
      return;
    }
    // 如果有上次的审阅结果，直接显示；否则显示确认对话框
    if (reviewResult) {
      setShowReviewDialog(true);
    } else {
      setShowReviewConfirmDialog(true);
    }
  };

  const handleStartReview = async () => {
    setShowReviewConfirmDialog(false);
    setReviewLoading(true);
    try {
      const res = await architectureApi.reviewArchitectures(id);
      const result = res.data;
      setReviewResult(result);
      // 保存到 localStorage
      localStorage.setItem(`architecture-review-${id}`, JSON.stringify(result));
      setShowReviewDialog(true);
      feedback.success('架构审阅完成。');
    } catch (error) {
      console.error('架构审阅失败:', error);
      feedback.error(error.response?.data?.error || '审阅失败，请稍后再试。');
    } finally {
      setReviewLoading(false);
    }
  };

  const handleClearReviewResult = () => {
    setReviewResult(null);
    localStorage.removeItem(`architecture-review-${id}`);
    feedback.success('已清除审阅结果，可以重新审阅。');
  };

  const handleRewriteArchitectures = async () => {
    if (!reviewResult) return;
    setRewriteLoading(true);
    setRewriteResult(null);
    try {
      const res = await architectureApi.rewriteArchitectures(id, reviewResult, rewritePrompt);
      setRewriteResult(res.data);
      localStorage.setItem(`architecture-rewrite-${id}`, JSON.stringify(res.data));
      setShowRewriteDialog(true);
      feedback.success('架构重写完成，请查看结果。');
    } catch (error) {
      console.error('架构重写失败:', error);
      feedback.error(error.response?.data?.error || '重写失败，请稍后再试。');
    } finally {
      setRewriteLoading(false);
    }
  };

  const handleApplyRewrite = async () => {
    if (!rewriteResult) return;
    setApplyingChanges(true);
    try {
      const res = await architectureApi.applyRewrite(id, rewriteResult);
      const { stats } = res.data;

      setShowRewriteDialog(false);
      setShowReviewDialog(false);
      setRewriteResult(null);
      setReviewResult(null);
      setRewritePrompt('');
      localStorage.removeItem(`architecture-rewrite-${id}`);
      localStorage.removeItem(`architecture-review-${id}`);
      feedback.success(`架构更新完成：更新 ${stats.updated} 项，新增 ${stats.created} 项，删除 ${stats.deleted} 项。`);
      loadData();
    } catch (error) {
      console.error('应用更改失败:', error);
      feedback.error(error.response?.data?.error || '应用更改失败，请稍后再试。');
    } finally {
      setApplyingChanges(false);
    }
  };

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
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>正在加载架构工作台...</span>
        </div>
      </div>
    );
  }

  return (
    <PageShell
      eyebrow="Architecture Studio"
      title="架构工作台"
      description="先稳住三层架构，再决定是批量拆章，还是直接进入正文生产。"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" asChild className="w-fit">
            <Link to={`/novels/${id}`} className="flex items-center justify-center">
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              返回
            </Link>
          </Button>
          <div className="h-4 w-px bg-border" />
          <Button
            variant="outline"
            size="sm"
            onClick={handleReviewClick}
            disabled={reviewLoading || architectures.length === 0}
          >
            {reviewLoading ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Eye className="mr-1.5 h-4 w-4" />
            )}
            {reviewResult ? '查看审阅结果' : '审阅架构'}
          </Button>
          <Button size="sm" onClick={startCreate}>
            <Plus className="mr-1.5 h-4 w-4" />
            新建架构
          </Button>
        </div>
      }
    >
      <StatGrid items={stats} />

      <SectionCard
        title="结构编辑区"
        description="这里优先处理全本、卷、章三级结构。先把骨架写顺，后面的生成结果会稳定很多。">
        <div className="space-y-6">
          {/* Full Architecture */}
          {fullArch ? (
            <Card className="border-sky-200/60 bg-sky-50/40">
              <CardContent className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-2">
                    <Badge variant="secondary" className="bg-sky-100 text-sky-700 hover:bg-sky-100">
                      全本
                    </Badge>
                    <h3 className="text-xl font-semibold text-slate-900">{fullArch.title}</h3>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => startEdit(fullArch)}>
                      <Pencil className="h-4 w-4" />
                      编辑
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => handleDelete(fullArch)}>
                      <Trash2 className="h-4 w-4" />
                      删除
                    </Button>
                  </div>
                </div>
                <ExpandableText
                  text={fullArch.plot_outline}
                  maxLength={120}
                  className="mt-4 text-sm leading-7 text-slate-600"
                />
                {!fullArch.plot_outline && (
                  <p className="mt-4 text-sm leading-7 text-slate-600">还没有全本情节大纲。</p>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/50 px-5 py-8 text-center">
              <p className="text-lg font-semibold text-slate-800">还没有全本架构</p>
              <p className="mt-2 text-sm leading-6 text-slate-500">建议先建立总纲，再去拆卷和章节。</p>
            </div>
          )}

          {/* Volume Architectures */}
          {volumes.length > 0 && (
            <div className="space-y-4">
              {volumes.map((volume) => {
                const volumeChapterArchs = chapterArchs.filter((arch) => arch.parent_id === volume.id);
                const isExpanded = expandedVolumes[volume.id] === true;
                return (
                  <Card key={volume.id} className="shadow-sm">
                    <CardContent className="p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-2">
                          <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                            卷
                          </Badge>
                          <h3 className="text-lg font-semibold text-slate-900">{volume.title}</h3>
                          <p className="text-sm text-slate-500">
                            {volumeChapterArchs.length} 条章架构
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {volumeChapterArchs.length > 0 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleVolumeExpand(volume.id)}
                              className="text-slate-600"
                            >
                              {isExpanded ? (
                                <>
                                  <ChevronUp className="mr-1 h-4 w-4" />
                                  收起
                                </>
                              ) : (
                                <>
                                  <ChevronDown className="mr-1 h-4 w-4" />
                                  展开 ({volumeChapterArchs.length})
                                </>
                              )}
                            </Button>
                          )}
                          {volumeChapterArchs.length > 0 && (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => handleBatchGenerateContent(volume)}
                              disabled={batchGeneratingContent}
                            >
                              {batchGeneratingContent ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Sparkles className="h-4 w-4" />
                              )}
                              批量生成正文
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={async () => {
                              if (volumeChapterArchs.length > 0) {
                                const confirmed = await feedback.confirm({
                                  title: `重新生成「${volume.title}」的章架构？`,
                                  message: `该卷已有 ${volumeChapterArchs.length} 条章架构，重新生成会删除该卷下现有章架构，以及这些章架构关联的正文和历史记录。`,
                                  note: '这是不可恢复的批量替换操作，请先确认不需要保留当前正文。',
                                  confirmText: '确认重新生成',
                                  cancelText: '取消',
                                  variant: 'danger',
                                });
                                if (!confirmed) return;
                              }
                              setSelectedVolumeId(volume.id.toString());
                              setShowChapterBatch(true);
                              setGeneratedChapters([]);
                            }}
                          >
                            <FileText className="h-4 w-4" />
                            {volumeChapterArchs.length > 0 ? '重新批量生成章架构' : '批量生成章架构'}
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => startEdit(volume)}>
                            <Pencil className="h-4 w-4" />
                            编辑
                          </Button>
                          <Button variant="destructive" size="sm" onClick={() => handleDelete(volume)}>
                            <Trash2 className="h-4 w-4" />
                            删除
                          </Button>
                        </div>
                      </div>
                      <ExpandableText
                        text={volume.plot_outline}
                        maxLength={120}
                        className="mt-4 text-sm leading-7 text-slate-600"
                      />
                      {!volume.plot_outline && (
                        <p className="mt-4 text-sm leading-7 text-slate-600">还没有卷情节概括。</p>
                      )}

                      {/* Chapter Architectures within Volume */}
                      {volumeChapterArchs.length > 0 ? (
                        isExpanded && (
                          <div className="mt-5 grid gap-3">
                            {volumeChapterArchs.map((chapterArch, index) => {
                              const existingChapter = getChapterByArchId(chapterArch.id);
                              return (
                                <Card key={chapterArch.id} className="border-slate-200/60 bg-slate-50/50">
                                  <CardContent className="p-4">
                                    <div className="flex items-start gap-3">
                                      <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <Badge variant="outline" className="border-amber-200 text-amber-700 shrink-0">
                                            第{index + 1}章
                                          </Badge>
                                          <p className="text-sm font-semibold text-slate-900">
                                            {chapterArch.title}
                                          </p>
                                          {existingChapter && (
                                            <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 shrink-0">
                                              已生成正文
                                            </Badge>
                                          )}
                                        </div>
                                        <p className="mt-2 text-sm leading-6 text-slate-600 line-clamp-2">
                                          {chapterArch.plot_outline || chapterArch.plot_summary || '还没有内容概括。'}
                                        </p>
                                      </div>
                                      <div className="flex items-center gap-1.5 shrink-0">
                                        {existingChapter && (
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8"
                                            title="发布章节"
                                            onClick={() => setPublishTarget({
                                              chapterId: existingChapter.id,
                                              chapterTitle: existingChapter.title || chapterArch.title,
                                              publishResult: existingChapter.publish_result,
                                            })}
                                          >
                                            <Upload className="h-4 w-4" />
                                          </Button>
                                        )}
                                        {existingChapter ? (
                                          <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                                            <Link to={`/chapters/${existingChapter.id}`}>
                                              <FileText className="h-4 w-4" />
                                            </Link>
                                          </Button>
                                        ) : (
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8"
                                            onClick={() => handleGenerateChapterContent(chapterArch)}
                                            disabled={generatingContent === chapterArch.id}
                                          >
                                            {generatingContent === chapterArch.id ? (
                                              <Loader2 className="h-4 w-4 animate-spin" />
                                            ) : (
                                              <Sparkles className="h-4 w-4" />
                                            )}
                                          </Button>
                                        )}
                                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => startEdit(chapterArch)}>
                                          <Pencil className="h-4 w-4" />
                                        </Button>
                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleDelete(chapterArch)}>
                                          <Trash2 className="h-4 w-4" />
                                        </Button>
                                      </div>
                                    </div>
                                  </CardContent>
                                </Card>
                              );
                            })}
                          </div>
                        )
                      ) : (
                        <div className="mt-5 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/50 px-4 py-5 text-sm text-slate-500">
                          这个卷还没有章架构，可以用右上角的"批量生成章架构"快速拆章。
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </SectionCard>

      {/* Create/Edit Dialog */}
      <Dialog open={showCreate || !!editingId} onOpenChange={(open) => !open && closeEditor()} disablePointerDismissal>
        <DialogContent className="sm:max-w-4xl bg-white max-h-[90vh] overflow-hidden flex flex-col p-0">
          <DialogHeader className="shrink-0 px-6 pt-6 pb-2">
            <DialogTitle>{editingId ? '编辑架构' : '创建架构'}</DialogTitle>
            <DialogDescription>
              {editingId ? '优先修正当前结构信息。' : '先确定层级和标题，再让 AI 帮你补大纲。'}
            </DialogDescription>
          </DialogHeader>
          {!editingId && (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleGenerate}
              disabled={generating}
              className="absolute right-14 top-6"
            >
              {generating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              让 AI 补全内容
            </Button>
          )}

          <form onSubmit={handleSubmit} className="space-y-4 overflow-y-auto px-6 pb-6">
            {!editingId && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">层级</Label>
                  <Select
                    value={formData.level}
                    onValueChange={(value) => setFormData({ ...formData, level: value, parentId: null })}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="选择层级">
                        {(value) => {
                          if (value === 'full') return '全本架构';
                          if (value === 'volume') return '卷架构';
                          if (value === 'chapter') return '章架构';
                          return null;
                        }}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent position="popper" className="z-50">
                      <SelectItem value="full">全本架构</SelectItem>
                      <SelectItem value="volume">卷架构</SelectItem>
                      <SelectItem value="chapter">章架构</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {formData.level !== 'full' && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">父级架构</Label>
                    <Select
                      value={formData.parentId?.toString() || ''}
                      onValueChange={(value) => setFormData({ ...formData, parentId: value ? parseInt(value, 10) : null })}
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder="请选择">
                          {(value) => {
                            if (!value) return null;
                            if (formData.level === 'volume') return fullArch?.title ?? null;
                            return volumes.find((v) => v.id === parseInt(value, 10))?.title ?? null;
                          }}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent position="popper" className="z-50">
                        {formData.level === 'volume' && fullArch && (
                          <SelectItem value={fullArch.id.toString()}>{fullArch.title}</SelectItem>
                        )}
                        {formData.level === 'chapter' &&
                          volumes.map((volume) => (
                            <SelectItem key={volume.id} value={volume.id.toString()}>
                              {volume.title}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs">标题</Label>
              <Input
                value={formData.title}
                onChange={(event) => setFormData({ ...formData, title: event.target.value })}
                placeholder="先起一个工作标题，方便 AI 抓主轴"
                className="h-8 text-sm"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">情节大纲</Label>
              <Textarea
                value={formData.plotOutline}
                onChange={(event) => setFormData({ ...formData, plotOutline: event.target.value })}
                rows={4}
                className="text-sm resize-none"
                placeholder="写清这层结构想解决的冲突、推进和结果。"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
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

            <div className="space-y-1.5 sm:max-w-xs">
              <Label className="text-xs">情感基调</Label>
              <Textarea
                value={formData.emotionalTone}
                onChange={(event) => setFormData({ ...formData, emotionalTone: event.target.value })}
                rows={4}
                className="text-sm resize-none"
                placeholder="热血 / 温柔 / 压迫 / 悬疑"
              />
            </div>

            <Separator className="my-2 shrink-0" />

            <DialogFooter className="shrink-0">
              <Button type="button" variant="outline" onClick={closeEditor}>
                取消
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {editingId ? '保存架构' : '创建架构'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Batch Chapter Generation Dialog */}
      <Dialog
        open={showChapterBatch}
        onOpenChange={(open) => !open && closeBatchDialog()}
      >
        <DialogContent className="sm:max-w-5xl" showCloseButton={!batchGenerating}>
          <DialogHeader>
            <DialogTitle>批量生成章架构</DialogTitle>
            <DialogDescription>
              {selectedVolumeId
                ? '将为选中的卷生成一批可编辑的章概括。生成后建议快速扫一遍标题和承接关系。'
                : '先选卷，再生成一批可编辑的章概括。生成后建议快速扫一遍标题和承接关系。'}
            </DialogDescription>
          </DialogHeader>

          {!selectedVolumeId && (
            <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
              <div className="space-y-2">
                <Label>选择卷架构</Label>
                <Select value={selectedVolumeId} onValueChange={setSelectedVolumeId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="请选择卷架构">
                      {(value) => volumes.find((v) => v.id.toString() === value)?.title ?? null}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {volumes.map((volume) => (
                      <SelectItem key={volume.id} value={volume.id.toString()}>
                        {volume.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={handleGenerateChapterBatch}
                disabled={batchGenerating || !selectedVolumeId}
              >
                {batchGenerating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                生成章架构草稿
              </Button>
            </div>
          )}

          {selectedVolumeId && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">目标卷：</span>
                <Badge variant="secondary">
                  {volumes.find((v) => v.id.toString() === selectedVolumeId)?.title}
                </Badge>
              </div>
              <Button
                onClick={handleGenerateChapterBatch}
                disabled={batchGenerating}
              >
                {batchGenerating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                生成章架构草稿
              </Button>
            </div>
          )}

          {generatedChapters.length > 0 && (
            <ScrollArea className="mt-4 max-h-[400px]">
              <div className="space-y-3 pr-4">
                {generatedChapters.map((chapter, index) => (
                  <Card key={`${chapter.chapterNumber}-${index}`} className="bg-slate-50/50">
                    <CardContent className="p-4">
                      <div className="grid gap-3 md:grid-cols-[auto_1fr] md:items-center">
                        <Badge variant="secondary" className="justify-center">
                          第 {chapter.chapterNumber} 章
                        </Badge>
                        <Input
                          value={chapter.title}
                          onChange={(event) => updateGeneratedChapter(index, 'title', event.target.value)}
                          placeholder="章节标题"
                        />
                      </div>
                      <Textarea
                        value={chapter.plot_summary}
                        onChange={(event) => updateGeneratedChapter(index, 'plot_summary', event.target.value)}
                        rows={3}
                        className="mt-3"
                        placeholder="章节概括"
                      />
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          )}

          <Separator />

          <DialogFooter>
            <Button
              variant="outline"
              onClick={closeBatchDialog}
              disabled={batchGenerating}
            >
              关闭
            </Button>
            {generatedChapters.length > 0 && (
              <Button onClick={handleSaveChapterBatch}>
                保存全部 {generatedChapters.length} 章
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Content Preview Dialog */}
      <Dialog open={showContentPreview} onOpenChange={(open) => !open && closePreview()}>
        <DialogContent className="sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>{previewTitle}</DialogTitle>
            <DialogDescription>
              这是 AI 生成的正文预览。确认风格和承接都没问题后，再保存成正式章节。
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2 sm:max-w-[10rem]">
              <Label>保存为章节号</Label>
              <Input
                type="number"
                min="1"
                value={previewChapterNumber}
                onChange={(event) => setPreviewChapterNumber(parseInt(event.target.value || '1', 10))}
              />
            </div>
          </div>

          <ScrollArea className="max-h-[400px] rounded-lg border bg-slate-50/50 p-4">
            <div className="text-sm leading-8 whitespace-pre-wrap text-slate-700">
              {previewContent}
            </div>
          </ScrollArea>

          <Separator />

          <DialogFooter>
            <Button variant="outline" onClick={closePreview}>
              关闭预览
            </Button>
            <Button onClick={handleSaveChapterContent} disabled={savingPreview}>
              {savingPreview && <Loader2 className="h-4 w-4 animate-spin" />}
              保存为正式章节
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Architecture Review Dialog */}
      <Dialog open={showReviewDialog} onOpenChange={(open) => !open && setShowReviewDialog(false)}>
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>架构审阅结果</DialogTitle>
            <DialogDescription>
              AI 已审阅完整架构，以下是发现的问题和改进建议。
            </DialogDescription>
          </DialogHeader>

          {reviewResult && (
            <ScrollArea className="max-h-[500px]">
              <div className="space-y-6 pr-4">
                {/* Overall Assessment */}
                <div className="rounded-lg border bg-slate-50/50 p-4">
                  <h4 className="mb-2 font-semibold">整体评价</h4>
                  <p className="text-sm text-slate-600">{reviewResult.overallAssessment}</p>
                </div>

                {/* Issues */}
                {reviewResult.issues && reviewResult.issues.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="font-semibold">发现的问题</h4>
                    {reviewResult.issues.map((issue, index) => (
                      <Card key={index} className="border-l-4 border-l-amber-400">
                        <CardContent className="p-4">
                          <div className="mb-2 flex items-center gap-2">
                            <Badge
                              variant={
                                issue.severity === 'high'
                                  ? 'destructive'
                                  : issue.severity === 'medium'
                                    ? 'default'
                                    : 'secondary'
                              }
                            >
                              {issue.severity === 'high' ? '严重' : issue.severity === 'medium' ? '中等' : '轻微'}
                            </Badge>
                            <Badge variant="outline">{issue.type}</Badge>
                            {issue.location && (
                              <span className="text-xs text-muted-foreground">{issue.location}</span>
                            )}
                          </div>
                          <p className="mb-2 text-sm font-medium">{issue.description}</p>
                          <p className="text-sm text-slate-600">
                            <span className="font-medium">建议：</span>
                            {issue.suggestion}
                          </p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}

                {/* Improvement Suggestions */}
                {reviewResult.improvementSuggestions && (
                  <div className="rounded-lg border bg-slate-50/50 p-4">
                    <h4 className="mb-2 font-semibold">整体改进建议</h4>
                    <p className="text-sm text-slate-600">{reviewResult.improvementSuggestions}</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          )}

          <Separator />

          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => setShowReviewDialog(false)}>
              关闭
            </Button>
            <Button variant="ghost" onClick={handleClearReviewResult}>
              重新审阅
            </Button>
            <Button
              onClick={() => {
                setShowReviewDialog(false);
                setShowRewriteDialog(true);
              }}
              disabled={!reviewResult}
            >
              <RefreshCw className="mr-1.5 h-4 w-4" />
              一键更改
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Review Confirm Dialog */}
      <Dialog open={showReviewConfirmDialog} onOpenChange={(open) => !open && setShowReviewConfirmDialog(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>开始架构审阅</DialogTitle>
            <DialogDescription>
              审阅过程会分析全本架构、卷架构和章架构的完整性和合理性，可能需要几分钟时间。
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg border bg-amber-50/50 p-4">
            <p className="text-sm text-amber-800">
              <strong>提示：</strong>审阅完成后，结果会自动保存。你可以随时查看审阅结果，直到你决定重新审阅或应用更改。
            </p>
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => setShowReviewConfirmDialog(false)}>
              取消
            </Button>
            <Button onClick={handleStartReview} disabled={reviewLoading}>
              {reviewLoading && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              开始审阅
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Architecture Rewrite Dialog */}
      <Dialog open={showRewriteDialog} onOpenChange={(open) => !open && setShowRewriteDialog(false)}>
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>架构优化</DialogTitle>
            <DialogDescription>
              AI 将根据审阅意见优化架构。你可以添加额外的要求来指导优化方向。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>额外要求（可选）</Label>
              <Textarea
                value={rewritePrompt}
                onChange={(e) => setRewritePrompt(e.target.value)}
                placeholder="例如：请加强主角的成长弧线；第三卷的高潮需要更激烈一些..."
                rows={3}
              />
            </div>

            {rewriteResult && (
              <ScrollArea className="max-h-[400px] rounded-lg border bg-slate-50/50 p-4">
                <div className="space-y-4">
                  {rewriteResult.fullArchitecture && (
                    <div>
                      <h4 className="mb-2 font-semibold">全本架构</h4>
                      <p className="text-sm font-medium">{rewriteResult.fullArchitecture.title}</p>
                      <p className="text-sm text-slate-600">
                        {rewriteResult.fullArchitecture.plotOutline}
                      </p>
                    </div>
                  )}

                  {rewriteResult.volumes && rewriteResult.volumes.length > 0 && (
                    <div>
                      <h4 className="mb-2 font-semibold">卷架构预览</h4>
                      <div className="space-y-2">
                        {rewriteResult.volumes.map((vol, idx) => (
                          <div key={idx} className="rounded border bg-white p-3">
                            <p className="text-sm font-medium">
                              {idx + 1}. {vol.title}
                            </p>
                            <p className="text-xs text-slate-500">
                              {vol.chapters?.length || 0} 章
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>
            )}
          </div>

          <Separator />

          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => setShowRewriteDialog(false)}>
              取消
            </Button>
            {!rewriteResult ? (
              <Button onClick={handleRewriteArchitectures} disabled={rewriteLoading}>
                {rewriteLoading && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                开始优化
              </Button>
            ) : (
              <Button onClick={handleApplyRewrite} disabled={applyingChanges}>
                {applyingChanges && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                应用更改
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <PublishDialog
        open={!!publishTarget}
        onClose={() => setPublishTarget(null)}
        chapterId={publishTarget?.chapterId}
        chapterTitle={publishTarget?.chapterTitle}
        publishResult={publishTarget?.publishResult}
      />
    </PageShell>
  );
}

export default ArchitectureManager;
