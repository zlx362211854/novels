import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { architectureApi, chapterApi } from '../services/api';
import PublishDialog from '../components/PublishDialog';
import { useFeedback } from '../components/ui/FeedbackProvider';
import { useAiStatus } from '../components/AiStatusProvider';
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

function ArchitectureReviewTaskPanel({ result, rewriteLoading, onClear, onGenerateRepair }) {
  return (
    <div className="space-y-4">
      {result?.summary ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-amber-100 bg-amber-50/60 p-4">
            <h4 className="mb-2 text-sm font-semibold text-slate-900">总体评价</h4>
            <p className="text-sm text-slate-600">{result.summary.overallAssessment}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Card>
              <CardContent className="p-4 text-sm">完整性：{result.summary.integrityScore}</CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-sm">流畅性：{result.summary.flowScore}</CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-sm">Bug 风险：{result.summary.bugScore}</CardContent>
            </Card>
          </div>
        </div>
      ) : null}

      {result?.issues?.length > 0 ? (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-slate-900">发现的问题</h4>
          {result.issues.map((issue, index) => (
            <Card key={`drawer-issue-${index}`} className="border-l-4 border-l-amber-400">
              <CardContent className="space-y-2 p-4">
                <div className="flex flex-wrap items-center gap-2">
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
                  <Badge variant="outline">{issue.category}</Badge>
                </div>
                <p className="text-sm font-medium text-slate-900">{issue.title}</p>
                <p className="text-sm text-slate-600">{issue.description}</p>
                {issue.affectedChapterIds?.length > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    涉及章架构 ID：{issue.affectedChapterIds.join('、')}
                  </p>
                ) : null}
                {issue.needsNewChapter ? (
                  <p className="text-xs font-medium text-amber-700">建议新增承接情节或过渡章</p>
                ) : null}
                <p className="text-sm text-slate-600">
                  <span className="font-medium">建议：</span>
                  {issue.suggestion}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-4 text-sm text-emerald-800">
          本轮未发现明确问题，可以直接继续创作。
        </div>
      )}

      <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
        <Button variant="outline" size="sm" onClick={onClear}>
          清除结果
        </Button>
        <Button size="sm" onClick={onGenerateRepair} disabled={rewriteLoading}>
          {rewriteLoading && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
          生成修补方案
        </Button>
      </div>
    </div>
  );
}

function ArchitectureRepairTaskPanel({ result, applyingChanges, onApply }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardContent className="p-4 text-sm">将更新 {result?.updatedChapters?.length || 0} 章</CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-sm">将新增 {result?.newChapters?.length || 0} 章</CardContent>
        </Card>
      </div>

      {(result?.updatedChapters || []).map((chapter) => (
        <div key={`drawer-update-${chapter.chapterId}`} className="rounded-lg border bg-slate-50/70 p-3">
          <p className="text-sm font-medium text-slate-900">
            更新章架构 #{chapter.chapterId}：{chapter.title}
          </p>
          <p className="mt-1 text-xs text-slate-500">{chapter.plotOutline}</p>
        </div>
      ))}

      {(result?.newChapters || []).map((chapter, idx) => (
        <div key={`drawer-new-${idx}`} className="rounded-lg border bg-slate-50/70 p-3">
          <p className="text-sm font-medium text-slate-900">新增章架构：{chapter.title}</p>
          <p className="mt-1 text-xs text-slate-500">
            插入到章架构 #{chapter.insertAfterChapterId} 之后
          </p>
          <p className="mt-1 text-xs text-slate-500">{chapter.plotOutline}</p>
        </div>
      ))}

      <div className="flex justify-end border-t pt-4">
        <Button size="sm" onClick={onApply} disabled={applyingChanges}>
          {applyingChanges && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
          应用修补
        </Button>
      </div>
    </div>
  );
}

function ArchitectureApplyTaskPanel({ updated, created }) {
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-4 text-sm text-emerald-900">
        章架构修补已完成：更新 {updated} 章，新增 {created} 章。
      </div>
    </div>
  );
}

function ArchitectureManager() {
  const { id } = useParams();
  const navigate = useNavigate();
  const feedback = useFeedback();
  const { setTaskPanel, clearTaskPanel } = useAiStatus();
  const [architectures, setArchitectures] = useState([]);
  const [chapters, setChapters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
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
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewResult, setReviewResult] = useState(null);
  const [rewriteLoading, setRewriteLoading] = useState(false);
  const [rewritePrompt, setRewritePrompt] = useState('');
  const [rewriteResult, setRewriteResult] = useState(null);
  const [applyingChanges, setApplyingChanges] = useState(false);
  const [selectedArchId, setSelectedArchId] = useState(null);
  const [workflowMode, setWorkflowMode] = useState('details');
  const detailPanelRef = useRef(null);

  useEffect(() => {
    loadData();
  }, [id]);

  useEffect(() => {
    if (architectures.length === 0) {
      setSelectedArchId(null);
      return;
    }
    setSelectedArchId((current) => {
      if (current && architectures.some((arch) => arch.id === current)) return current;
      return architectures.find((arch) => arch.level === 'full')?.id || architectures[0]?.id || null;
    });
  }, [architectures]);

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
    const targetVolumeId =
      selectedArch?.level === 'volume'
        ? selectedArch.id?.toString()
        : selectedVolumeId;

    if (!targetVolumeId) {
      feedback.warning('请先选择一个卷架构。');
      return;
    }
    setBatchGenerating(true);
    setGeneratedChapters([]);
    try {
      const res = await architectureApi.generateChapterArchitectures(id, targetVolumeId);
      const normalized = (res.data || []).map((ch, i) => ({
        chapterNumber: ch.chapter_number ?? ch.chapterNumber ?? (i + 1),
        title: ch.title || '',
        plot_summary: ch.plot_summary || ch.summary || ch.plot_outline || ch.plotOutline || '',
      }));
      setSelectedVolumeId(targetVolumeId);
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
      setGeneratedChapters([]);
      setSelectedVolumeId('');
      setWorkflowMode('details');
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

  const handleOpenChapterArch = async (chapterArch) => {
    const existingChapter = getChapterByArchId(chapterArch.id);
    if (existingChapter) {
      navigate(`/chapters/${existingChapter.id}`);
      return;
    }

    try {
      const maxChapterNumber = chapters.reduce(
        (result, chapter) => Math.max(result, chapter.chapter_number || 0),
        0
      );
      const res = await chapterApi.create(id, {
        architectureId: chapterArch.id,
        chapterNumber: maxChapterNumber + 1,
        title: chapterArch.title,
        content: '',
        status: 'draft',
      });
      navigate(`/chapters/${res.data.id}`);
    } catch (error) {
      console.error('创建章节失败:', error);
      feedback.error(error.response?.data?.error || '创建章节失败，请稍后再试。');
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
    setSelectedArchId(fullArch?.id || architectures[0]?.id || null);
    setReviewResult(null);
    setRewriteResult(null);
    clearTaskPanel();
    requestAnimationFrame(() => {
      detailPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    void handleStartReview();
  };

  const handleStartReview = async () => {
    setReviewLoading(true);
    try {
      const res = await architectureApi.reviewChapterArchitectures(id);
      const { taskId, result } = res.data;
      setReviewResult(result);
      setTaskPanel(
        taskId,
        <ArchitectureReviewTaskPanel
          result={result}
          rewriteLoading={rewriteLoading}
          onClear={handleClearReviewResult}
          onGenerateRepair={() => void handleRewriteArchitectures(result)}
        />
      );
      feedback.success('全书级章架构审阅完成。');
    } catch (error) {
      console.error('全书级章架构审阅失败:', error);
      feedback.error(error.response?.data?.error || '全书级章架构审阅失败，请稍后再试。');
    } finally {
      setReviewLoading(false);
    }
  };

  const handleClearReviewResult = () => {
    setReviewResult(null);
    setRewriteResult(null);
    clearTaskPanel();
    feedback.success('已清除审阅结果，可以重新审阅。');
  };

  const handleRewriteArchitectures = async (reviewData = reviewResult) => {
    if (!reviewData) return;
    setRewriteLoading(true);
    setRewriteResult(null);
    clearTaskPanel();
    try {
      const res = await architectureApi.repairChapterArchitectures(id, reviewData, rewritePrompt);
      const { taskId, result } = res.data;
      setRewriteResult(result);
      setTaskPanel(
        taskId,
        <ArchitectureRepairTaskPanel
          result={result}
          applyingChanges={applyingChanges}
          onApply={() => void handleApplyRewrite(result)}
        />
      );
      feedback.success('章架构修补方案已生成，请查看结果。');
    } catch (error) {
      console.error('生成章架构修补方案失败:', error);
      feedback.error(error.response?.data?.error || '生成修补方案失败，请稍后再试。');
    } finally {
      setRewriteLoading(false);
    }
  };

  const handleApplyRewrite = async (repairData = rewriteResult) => {
    if (!repairData) return;
    setApplyingChanges(true);
    clearTaskPanel();
    try {
      const res = await architectureApi.applyChapterArchitectureRepair(id, repairData);
      const { taskId, result } = res.data;
      const { updated = 0, created = 0 } = result;

      setRewriteResult(null);
      setReviewResult(null);
      setRewritePrompt('');
      setTaskPanel(taskId, <ArchitectureApplyTaskPanel updated={updated} created={created} />);
      feedback.success(`章架构修补完成：更新 ${updated} 章，新增 ${created} 章。`);
      loadData();
    } catch (error) {
      console.error('应用章架构修补失败:', error);
      feedback.error(error.response?.data?.error || '应用章架构修补失败，请稍后再试。');
    } finally {
      setApplyingChanges(false);
    }
  };

  const fullArch = architectures.find((arch) => arch.level === 'full');
  const volumes = architectures.filter((arch) => arch.level === 'volume');
  const volumeIdsKey = volumes.map((volume) => volume.id).join(',');
  const chapterArchs = architectures.filter((arch) => arch.level === 'chapter');
  const projectedChapterNumberByArchId = useMemo(() => {
    const volumeOrder = new Map(
      [...volumes]
        .sort((left, right) => (left.id || 0) - (right.id || 0))
        .map((volume, index) => [volume.id, index])
    );

    const orderedChapterArchs = [...chapterArchs].sort((left, right) => {
      const leftVolumeOrder = volumeOrder.get(left.parent_id) ?? Number.MAX_SAFE_INTEGER;
      const rightVolumeOrder = volumeOrder.get(right.parent_id) ?? Number.MAX_SAFE_INTEGER;
      if (leftVolumeOrder !== rightVolumeOrder) return leftVolumeOrder - rightVolumeOrder;
      return (left.id || 0) - (right.id || 0);
    });

    return new Map(
      orderedChapterArchs.map((arch, index) => [arch.id, index + 1])
    );
  }, [chapterArchs, volumes]);

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

  const selectedArch = useMemo(
    () => architectures.find((arch) => arch.id === selectedArchId) || fullArch || architectures[0] || null,
    [architectures, fullArch, selectedArchId]
  );

  const selectedChildren = useMemo(() => {
    if (!selectedArch) return [];
    if (selectedArch.level === 'full') return volumes;
    if (selectedArch.level === 'volume') return chapterArchs.filter((arch) => arch.parent_id === selectedArch.id);
    return [];
  }, [chapterArchs, selectedArch, volumes]);

  useEffect(() => {
    if (volumes.length === 0) {
      setExpandedVolumes({});
      return;
    }

    setExpandedVolumes((current) => {
      const volumeIds = volumes.map((volume) => volume.id);
      const currentIds = Object.keys(current).map(Number);
      const hasSameIds =
        currentIds.length === volumeIds.length &&
        volumeIds.every((volumeId) => Object.prototype.hasOwnProperty.call(current, volumeId));

      if (hasSameIds) return current;

      return Object.fromEntries(
        volumeIds.map((volumeId, index) => [
          volumeId,
          Object.prototype.hasOwnProperty.call(current, volumeId) ? current[volumeId] : index === 0,
        ])
      );
    });
  }, [volumeIdsKey]);

  useEffect(() => {
    if (selectedArch?.level !== 'volume' && workflowMode === 'chapterBatch') {
      setWorkflowMode('details');
      setGeneratedChapters([]);
      setSelectedVolumeId('');
    }
  }, [selectedArch, workflowMode]);

  useEffect(() => {
    if (workflowMode === 'chapterBatch') {
      requestAnimationFrame(() => {
        detailPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  }, [workflowMode]);

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
      density="compact"
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
            审阅架构
          </Button>
          <Button size="sm" onClick={startCreate}>
            <Plus className="mr-1.5 h-4 w-4" />
            新建架构
          </Button>
        </div>
      }
    >
      <StatGrid items={stats} compact />

      <SectionCard
        title="结构编辑区"
        description="左侧按全本、卷、章组织结构；右侧只处理当前选中的架构。"
        className="rounded-lg"
        contentClassName="px-0 pb-0"
      >
        <div className="grid min-h-[620px] border-t border-border lg:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="border-b border-border bg-secondary/35 p-3 lg:border-r lg:border-b-0">
            {!fullArch ? (
              <div className="rounded-lg border border-dashed border-primary/25 bg-card/75 px-4 py-8 text-center text-sm text-muted-foreground">
                还没有全本架构。建议先建立总纲。
              </div>
            ) : (
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => setSelectedArchId(fullArch.id)}
                  className={`w-full rounded-md border px-3 py-2 text-left transition ${
                    selectedArch?.id === fullArch.id
                      ? 'border-primary bg-card shadow-sm shadow-primary/10'
                      : 'border-transparent hover:border-primary/20 hover:bg-card/70'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-900">{fullArch.title}</span>
                    <Badge variant="secondary" className="shrink-0">全本</Badge>
                  </div>
                </button>

                <div className="space-y-2">
                  {volumes.map((volume, volumeIndex) => {
                    const volumeChapterArchs = chapterArchs.filter((arch) => arch.parent_id === volume.id);
                    const isVolumeExpanded = expandedVolumes[volume.id] ?? volumeIndex === 0;
                    return (
                      <div key={volume.id} className="rounded-md border border-border/80 bg-card/82">
                        <div
                          className={`flex items-center gap-1 ${
                            selectedArch?.id === volume.id ? 'bg-primary text-primary-foreground' : ''
                          }`}
                        >
                          <button
                            type="button"
                            aria-expanded={isVolumeExpanded}
                            onClick={() => {
                              setSelectedArchId(volume.id);
                              toggleVolumeExpand(volume.id);
                            }}
                            className={`flex min-w-0 flex-1 items-center justify-between gap-2 px-3 py-2 text-left transition ${
                              selectedArch?.id === volume.id ? '' : 'hover:bg-accent/45'
                            }`}
                          >
                            <span className="min-w-0 truncate text-sm font-semibold">
                              {volumeIndex + 1}. {volume.title}
                            </span>
                            <span className={`shrink-0 text-xs ${selectedArch?.id === volume.id ? 'text-primary-foreground/75' : 'text-muted-foreground'}`}>
                              {volumeChapterArchs.length} 章
                            </span>
                          </button>
                          <button
                            type="button"
                            aria-expanded={isVolumeExpanded}
                            aria-label={`${isVolumeExpanded ? '收起' : '展开'}${volume.title}`}
                            title={isVolumeExpanded ? '收起卷章节' : '展开卷章节'}
                            onClick={(event) => {
                              event.stopPropagation();
                              toggleVolumeExpand(volume.id);
                            }}
                            className={`mr-2 flex size-7 shrink-0 items-center justify-center rounded-md transition ${
                              selectedArch?.id === volume.id
                                ? 'text-primary-foreground/80 hover:bg-primary-foreground/15 hover:text-primary-foreground'
                                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                            }`}
                          >
                            {isVolumeExpanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                          </button>
                        </div>
                        {isVolumeExpanded && (
                          <div className="border-t border-slate-100 py-1">
                            {volumeChapterArchs.map((chapterArch) => {
                              const existingChapter = getChapterByArchId(chapterArch.id);
                              const projectedChapterNumber = projectedChapterNumberByArchId.get(chapterArch.id);
                              return (
                                <button
                                  key={chapterArch.id}
                                  type="button"
                                  onClick={() => setSelectedArchId(chapterArch.id)}
                                  className={`grid w-full grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-2 px-3 py-1.5 text-left text-sm transition ${
                                    selectedArch?.id === chapterArch.id
                                      ? 'bg-secondary text-secondary-foreground'
                                      : 'text-slate-600 hover:bg-accent/35'
                                  }`}
                                >
                                  <span className="text-xs tabular-nums text-slate-400">
                                    {projectedChapterNumber ? `第${existingChapter?.chapter_number || projectedChapterNumber}` : '章'}
                                  </span>
                                  <span className="truncate">{chapterArch.title}</span>
                                  {existingChapter ? (
                                    <span className="size-2 rounded-full bg-emerald-400" title="已生成正文" />
                                  ) : (
                                    <span className="size-2 rounded-full bg-slate-300" title="未生成正文" />
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </aside>

          <section
            ref={detailPanelRef}
            className={`min-w-0 p-4 transition ${
              workflowMode === 'chapterBatch'
                ? 'bg-primary/5 ring-1 ring-primary/15'
                : ''
            }`}
          >
            {!selectedArch ? (
              <div className="flex min-h-[520px] items-center justify-center rounded-lg border border-dashed border-primary/25 bg-secondary/35 text-sm text-muted-foreground">
                选择左侧架构节点查看详情。
              </div>
            ) : (
              <div className="space-y-4">
                {workflowMode === 'chapterBatch' && selectedArch?.level === 'volume' && (
                  <div className="space-y-4 rounded-lg border border-emerald-200 bg-emerald-50/60 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-widest text-emerald-700">批量拆章流程</p>
                        <h4 className="mt-1 text-lg font-semibold text-slate-900">为「{selectedArch.title}」生成章架构草稿</h4>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setWorkflowMode('details');
                            setGeneratedChapters([]);
                            setSelectedVolumeId('');
                          }}
                          disabled={batchGenerating}
                        >
                          返回详情
                        </Button>
                        <Button size="sm" onClick={handleGenerateChapterBatch} disabled={batchGenerating}>
                          {batchGenerating && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                          {generatedChapters.length > 0 ? '重新生成草稿' : '生成章架构草稿'}
                        </Button>
                      </div>
                    </div>

                    {generatedChapters.length === 0 ? (
                      <div className="rounded-lg border border-emerald-100 bg-white/80 p-4 text-sm text-slate-600">
                        这里会在右侧直接展示生成后的章架构草稿。你可以逐条改标题和概括，确认后再点击底部“保存架构”。
                      </div>
                    ) : (
                      <>
                        <div className="rounded-lg border border-emerald-100 bg-white/80 p-4 text-sm text-slate-600">
                          已生成 {generatedChapters.length} 条章架构草稿。你可以先在右侧逐条调整，再点击底部“保存架构”。
                        </div>
                        <div className="space-y-3">
                          {generatedChapters.map((chapter, index) => (
                            <Card key={`${chapter.chapterNumber}-${index}`} className="bg-white/90">
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
                        <div className="flex justify-end">
                          <Button onClick={handleSaveChapterBatch}>
                            保存架构
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant={selectedArch.level === 'full' ? 'secondary' : 'outline'}
                        className={
                          selectedArch.level === 'volume'
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                            : selectedArch.level === 'chapter'
                              ? 'border-sky-200 bg-sky-50 text-sky-700'
                              : ''
                        }
                      >
                        {selectedArch.level === 'full' ? '全本' : selectedArch.level === 'volume' ? '卷' : '章'}
                      </Badge>
                      {selectedArch.level === 'chapter' && (() => {
                        const existingChapter = getChapterByArchId(selectedArch.id);
                        return existingChapter ? (
                          <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">已生成正文</Badge>
                        ) : (
                          <Badge variant="outline">未生成正文</Badge>
                        );
                      })()}
                    </div>
                    <h3 className="text-2xl font-semibold tracking-tight text-slate-950">{selectedArch.title}</h3>
                    {selectedChildren.length > 0 && (
                      <p className="text-sm text-slate-500">
                        下级结构：{selectedChildren.length} 条
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {selectedArch.level === 'volume' && (() => {
                      const volumeChapterArchs = chapterArchs.filter((arch) => arch.parent_id === selectedArch.id);
                      return (
                        <>
                          {volumeChapterArchs.length > 0 && (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => handleBatchGenerateContent(selectedArch)}
                              disabled={batchGeneratingContent}
                            >
                              {batchGeneratingContent ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                              批量生成正文
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedVolumeId(selectedArch.id.toString());
                              setGeneratedChapters([]);
                              setWorkflowMode('chapterBatch');
                            }}
                          >
                            <FileText className="h-4 w-4" />
                            {volumeChapterArchs.length > 0 ? '进入拆章流程' : '批量拆章'}
                          </Button>
                        </>
                      );
                    })()}
                    {selectedArch.level === 'chapter' && (() => {
                      const existingChapter = getChapterByArchId(selectedArch.id);
                      return existingChapter ? (
                        <>
                          <Button variant="outline" size="sm" asChild>
                            <Link to={`/chapters/${existingChapter.id}`}>
                              <FileText className="h-4 w-4" />
                              打开正文
                            </Link>
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPublishTarget({
                              chapterId: existingChapter.id,
                              chapterTitle: existingChapter.title || selectedArch.title,
                              publishResult: existingChapter.publish_result,
                            })}
                          >
                            <Upload className="h-4 w-4" />
                            发布
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleGenerateChapterContent(selectedArch)}
                          disabled={generatingContent === selectedArch.id}
                        >
                          {generatingContent === selectedArch.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                          生成正文
                        </Button>
                      );
                    })()}
                    <Button variant="outline" size="sm" onClick={() => startEdit(selectedArch)}>
                      <Pencil className="h-4 w-4" />
                      编辑
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => handleDelete(selectedArch)}>
                      <Trash2 className="h-4 w-4" />
                      删除
                    </Button>
                  </div>
                </div>

                <div
                  className={`grid gap-4 ${
                    selectedArch.level === 'chapter'
                      ? 'grid-cols-1'
                      : 'xl:grid-cols-[minmax(0,1fr)_280px]'
                  }`}
                >
                  <div className="space-y-4">
                    <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-500">情节大纲</p>
                      {selectedArch.plot_outline || selectedArch.plot_summary ? (
                        <div className="prose prose-slate max-w-none text-sm leading-7 text-slate-700">
                          <ReactMarkdown>
                            {selectedArch.plot_outline || selectedArch.plot_summary}
                          </ReactMarkdown>
                        </div>
                      ) : (
                        <p className="text-sm leading-7 text-slate-500">还没有内容概括。</p>
                      )}
                    </div>

                    {selectedArch.level === 'chapter' && (() => {
                      const existingChapter = getChapterByArchId(selectedArch.id);
                      return (
                        <div className="rounded-lg border border-slate-200 bg-white p-4">
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">正文内容</p>
                            {existingChapter ? (
                              <Button variant="outline" size="sm" asChild>
                                <Link to={`/chapters/${existingChapter.id}?edit=1`}>
                                  <Pencil className="mr-1.5 h-4 w-4" />
                                  编辑正文
                                </Link>
                              </Button>
                            ) : null}
                          </div>
                          {existingChapter?.content?.trim() ? (
                            <div className="max-h-[520px] overflow-y-auto rounded-md border border-slate-100 bg-slate-50/60 p-4 text-sm leading-7 whitespace-pre-wrap text-slate-700">
                              {existingChapter.content}
                            </div>
                          ) : (
                            <p className="text-sm leading-7 text-slate-500">这条章架构还没有生成正文。</p>
                          )}
                        </div>
                      );
                    })()}
                  </div>

                  {selectedArch.level !== 'chapter' && (
                    <div className="space-y-3">
                      <div className="rounded-lg border border-slate-200 bg-white p-3">
                        <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">下级结构</p>
                        <p className="mt-2 text-2xl font-semibold tabular-nums">{selectedChildren.length}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>
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
