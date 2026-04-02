import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { architectureApi, chapterApi } from '../services/api';
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
import { Loader2, Plus, Pencil, Trash2, Sparkles, FileText, ArrowLeft, ChevronDown, ChevronUp } from 'lucide-react';

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
  const [expandedVolumes, setExpandedVolumes] = useState({});

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
                                  message: `该卷已有 ${volumeChapterArchs.length} 条章架构，重新生成将覆盖原有内容。`,
                                  note: '建议先确认是否需要保留现有架构。',
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
                                          {chapterArch.plot_outline || '还没有内容概括。'}
                                        </p>
                                      </div>
                                      <div className="flex items-center gap-1.5 shrink-0">
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
      <Dialog open={showCreate || !!editingId} onOpenChange={(open) => !open && closeEditor()}>
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
              <Input
                value={formData.emotionalTone}
                onChange={(event) => setFormData({ ...formData, emotionalTone: event.target.value })}
                className="h-8 text-sm"
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
                        value={chapter.plotOutline}
                        onChange={(event) => updateGeneratedChapter(index, 'plotOutline', event.target.value)}
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
    </PageShell>
  );
}

export default ArchitectureManager;
