import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { chapterApi } from '../services/api';
import PublishDialog from '../components/PublishDialog';
import { useFeedback } from '../components/ui/FeedbackProvider';
import { MarkdownEditor } from '../components/ui/MarkdownEditor';
import { PageShell, SectionCard, StatGrid } from '../components/ui/PageShell';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Tabs, TabsContent } from '../components/ui/tabs';
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

      setChapter(chapterRes.data);
      setEditContent(chapterRes.data.content || '');
      setEditTitle(chapterRes.data.title || '');
      setReview(chapterRes.data.review_result || null);
      setVersions(versionRes.data);
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
      const res = await chapterApi.revise(id, review);
      setChapter(res.data.chapter);
      setEditContent(res.data.chapter.content || '');
      setEditTitle(res.data.chapter.title || '');
      setReview(res.data.review || null);
      await refreshVersions();
      setMode('edit');
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
          </div>
        }
      >
        <StatGrid items={stats} />

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
              ? '左侧编辑，右侧预览；如果只是看内容，可以随时回到阅读视图。'
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
            <Tabs defaultValue="edit" className="w-full">
              <TabsContent value="edit">
                <div className="grid gap-4 lg:grid-cols-2">
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
                  <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
                    <p className="mb-3 text-sm font-medium text-slate-600">实时预览</p>
                    <ScrollArea>
                      <div className="prose prose-slate max-w-none pr-4">
                        <ReactMarkdown>{editContent || '*暂无内容*'}</ReactMarkdown>
                      </div>
                    </ScrollArea>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="preview">
                <ScrollArea className="h-[600px]">
                  <div className="prose prose-lg max-w-none p-4">
                    <ReactMarkdown>{editContent || '*暂无内容*'}</ReactMarkdown>
                  </div>
                </ScrollArea>
              </TabsContent>
            </Tabs>
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
