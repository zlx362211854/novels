import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { architectureApi, chapterApi, exportApi, novelApi, publishApi } from '../services/api';
import RecurringTaskCard from '../components/RecurringTaskCard';
import { DEFAULT_CHAPTER_GENERATION_PROMPT_TEMPLATE } from '../lib/defaultChapterPromptTemplate';
import { useFeedback } from '../components/ui/FeedbackProvider';
import { PageShell, SectionCard, StatGrid } from '../components/ui/PageShell';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import { Progress } from '../components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import {
  ArrowLeft,
  Pencil,
  Download,
  FolderOpen,
  Loader2,
  BookOpen,
  BookMarked,
  Layers,
  FileText,
  CheckCircle,
} from 'lucide-react';

const MODEL_OPTIONS = [
  { value: 'zhipu', label: '智谱 AI' },
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'minimax', label: 'MiniMax' },
];

const emptyProfile = () => ({ provider: '', model: '', maxTokens: '' });

function normalizeProfile(value, fallbackProvider = '') {
  if (!value) return { provider: fallbackProvider, model: '', maxTokens: '' };
  if (typeof value === 'string') return { provider: value, model: '', maxTokens: '' };
  return {
    provider: value.provider || fallbackProvider || '',
    model: value.model || '',
    maxTokens: value.maxTokens ?? '',
  };
}

function serializeProfile(profile) {
  if (!profile?.provider) return null;
  const maxTokens = Number(profile.maxTokens);
  return {
    provider: profile.provider,
    model: profile.model?.trim() || undefined,
    maxTokens: Number.isFinite(maxTokens) && maxTokens > 0 ? Math.floor(maxTokens) : undefined,
  };
}

const GRAPH_MODEL_FIELDS = [
  { key: 'chapterGeneration', label: '章节生成' },
  { key: 'chapterReview', label: '章节审阅' },
  { key: 'chapterRevision', label: '章节修订' },
  { key: 'chapterTune', label: '章节微调' },
  { key: 'memoryExtraction', label: '记忆卡提取' },
  { key: 'crossChapterReview', label: '跨章审阅' },
];

function NovelDetail() {
  const { id } = useParams();
  const feedback = useFeedback();
  const [novel, setNovel] = useState(null);
  const [architectures, setArchitectures] = useState([]);
  const [chapters, setChapters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [publishPlatforms, setPublishPlatforms] = useState([]);
  const [editForm, setEditForm] = useState({
    title: '',
    description: '',
    genre: '',
    publishConfig: {},
    aiConfig: { defaultModel: '', defaultProfile: emptyProfile(), graphModels: {}, chapterGenerationPromptTemplate: '' },
  });

  const parsePublishConfig = (value) => {
    if (!value) return {};
    if (typeof value !== 'string') return value;
    try { return JSON.parse(value); } catch { return {}; }
  };

  const parseAiConfig = (value) => {
    if (!value) return { defaultModel: '', defaultProfile: emptyProfile(), graphModels: {}, chapterGenerationPromptTemplate: '' };
    if (typeof value !== 'string') {
      return {
        defaultModel: value.defaultModel || '',
        defaultProfile: normalizeProfile(value.defaultProfile || value.defaultModel, value.defaultModel || ''),
        graphModels: Object.fromEntries(
          Object.entries(value.graphModels || {}).map(([key, item]) => [key, normalizeProfile(item)])
        ),
        chapterGenerationPromptTemplate: value.chapterGenerationPromptTemplate || '',
      };
    }
    try {
      const parsed = JSON.parse(value);
      return {
        defaultModel: parsed.defaultModel || '',
        defaultProfile: normalizeProfile(parsed.defaultProfile || parsed.defaultModel, parsed.defaultModel || ''),
        graphModels: Object.fromEntries(
          Object.entries(parsed.graphModels || {}).map(([key, item]) => [key, normalizeProfile(item)])
        ),
        chapterGenerationPromptTemplate: parsed.chapterGenerationPromptTemplate || '',
      };
    } catch {
      return { defaultModel: '', defaultProfile: emptyProfile(), graphModels: {}, chapterGenerationPromptTemplate: '' };
    }
  };

  useEffect(() => {
    loadData();
  }, [id]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [novelRes, archRes, chapterRes, platformsRes] = await Promise.all([
        novelApi.getById(id),
        architectureApi.getByNovelId(id),
        chapterApi.getByNovelId(id),
        publishApi.platforms().catch(() => ({ data: [] })),
      ]);
      setNovel(novelRes.data);
      setArchitectures(archRes.data);
      setChapters(chapterRes.data);
      setPublishPlatforms(platformsRes.data);
      setEditForm({
        title: novelRes.data.title,
        description: novelRes.data.description || '',
        genre: novelRes.data.genre || '',
        publishConfig: parsePublishConfig(novelRes.data.publish_config),
        aiConfig: parseAiConfig(novelRes.data.ai_config),
      });
    } catch (error) {
      console.error('加载数据失败:', error);
      feedback.error('小说工作台加载失败，请稍后重试。');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const res = await novelApi.update(id, editForm);
      setNovel(res.data);
      setEditing(false);
      feedback.success('小说信息已更新。');
    } catch (error) {
      console.error('更新失败:', error);
      feedback.error(error.response?.data?.error || '保存失败，请稍后再试。');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setEditing(false);
    setEditForm({
      title: novel?.title || '',
      description: novel?.description || '',
      genre: novel?.genre || '',
      publishConfig: parsePublishConfig(novel?.publish_config),
      aiConfig: parseAiConfig(novel?.ai_config),
    });
  };

  const handleExport = async (scope) => {
    setExporting(true);
    try {
      const res = await exportApi.exportNovel(id, scope);
      const blob = new Blob([res.data], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${novel.title}.md`;
      a.click();
      URL.revokeObjectURL(url);
      feedback.success('已导出 Markdown 文件。');
    } catch (error) {
      console.error('导出失败:', error);
      feedback.error('导出失败，请稍后再试。');
    } finally {
      setExporting(false);
    }
  };

  const handleExportJson = async () => {
    setExporting(true);
    try {
      const res = await exportApi.exportNovelJson(id);
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${novel.title}.json`;
      a.click();
      URL.revokeObjectURL(url);
      feedback.success('已导出 JSON 文件。');
    } catch (error) {
      console.error('导出 JSON 失败:', error);
      feedback.error(error.response?.data?.error || '导出失败，请稍后再试。');
    } finally {
      setExporting(false);
    }
  };

  const summary = useMemo(() => {
    const full = architectures.filter((item) => item.level === 'full').length;
    const volume = architectures.filter((item) => item.level === 'volume').length;
    const chapterArch = architectures.filter((item) => item.level === 'chapter').length;
    const generated = chapters.filter((item) => item.status === 'generated').length;
    const draft = chapters.filter((item) => item.status === 'draft').length;
    const totalChapters = chapterArch || chapters.length;

    return {
      full,
      volume,
      chapterArch,
      generated,
      draft,
      totalChapters,
      progress: totalChapters ? Math.round((generated / totalChapters) * 100) : 0,
    };
  }, [architectures, chapters]);

  if (loading) {
    return (
      <PageShell eyebrow="Novel Workspace" title="加载中..." description="">
        <div className="flex min-h-[30vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </PageShell>
    );
  }

  if (!novel) {
    return (
      <PageShell eyebrow="Novel Workspace" title="小说不存在" description="">
        <div className="flex min-h-[30vh] items-center justify-center">
          <p className="text-muted-foreground">找不到这部小说</p>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell
      eyebrow="Novel Workspace"
      title={novel.title}
      description={novel.description || '先搭骨架，再生成章节，再统一回看节奏和完整度。'}
      density="compact"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/" className="flex items-center justify-center">
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              返回
            </Link>
          </Button>
          <div className="h-4 w-px bg-border" />
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            <Pencil className="mr-1.5 h-4 w-4" />
            编辑
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleExport('full')} disabled={exporting}>
            {exporting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Download className="mr-1.5 h-4 w-4" />}
            导出
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportJson} disabled={exporting}>
            {exporting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Download className="mr-1.5 h-4 w-4" />}
            导出 JSON
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to={`/novels/${id}/story-bible`} className="flex items-center justify-center">
              <BookMarked className="mr-1.5 h-4 w-4" />
              故事圣经
            </Link>
          </Button>
          <Button size="sm" asChild>
            <Link to={`/novels/${id}/architecture`} className="flex items-center justify-center">
              <FolderOpen className="mr-1.5 h-4 w-4" />
              架构工作台
            </Link>
          </Button>
        </div>
      }
    >
      {/* Progress Section */}
      <SectionCard tone="accent">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">当前进度</p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-4xl font-bold">{summary.progress}%</span>
              <span className="text-sm text-muted-foreground">
                已完成 {summary.generated} / {summary.totalChapters} 章
              </span>
            </div>
          </div>
          <div className="w-full sm:w-64">
            <Progress value={summary.progress} className="h-2" />
          </div>
        </div>
      </SectionCard>

      <StatGrid
        compact
        items={[
          { label: '全本架构', value: summary.full, caption: summary.full ? '总纲已建立' : '建议先补全总纲' },
          { label: '卷架构', value: summary.volume, caption: '管理篇章节奏' },
          { label: '章架构', value: summary.chapterArch, caption: '用于批量生产' },
          { label: '已生成章节', value: summary.generated, caption: `${summary.draft} 章草稿` },
        ]}
      />

      <SectionCard
        title="继续创作"
        description="小说详情页只做轻量概览，真正的结构调整在架构工作台完成。"
        actions={
          <>
            <Button asChild variant="secondary">
              <Link to={`/novels/${id}/chapters`}>进入章节列表</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to={`/novels/${id}/story-bible`}>管理故事圣经</Link>
            </Button>
            <Button asChild>
              <Link to={`/novels/${id}/architecture`}>进入架构工作台</Link>
            </Button>
          </>
        }
      >
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Recommended Path */}
          <div className="rounded-lg border bg-muted/30 p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">推荐路径</p>
            <div className="mt-3 space-y-2 text-sm text-muted-foreground">
              <p>
                {summary.full
                  ? '总纲已经有了，下一步建议进入架构工作台，检查卷与章的承接，再决定是否生成正文。'
                  : '当前还没有全本架构，建议先进入架构工作台把总纲搭起来。'}
              </p>
              <p>所有高频动作都在架构工作台：补结构、拆章、单章试产、批量出稿。</p>
            </div>
          </div>

          {/* Project Info */}
          <div className="rounded-lg border p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">项目信息</p>
            <div className="mt-3 space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <Badge variant={novel.genre ? 'secondary' : 'outline'}>
                  {novel.genre || '未设置类型'}
                </Badge>
              </div>
              <div>
                <p className="text-muted-foreground">简介</p>
                <p className="mt-1">{novel.description || '还没有填写简介。'}</p>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <CheckCircle className="h-4 w-4 text-emerald-500" />
                <span>
                  {summary.totalChapters
                    ? `已完成 ${summary.generated} / ${summary.totalChapters} 章正文`
                    : '还没有章节，建议先从架构工作台开始'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </SectionCard>

      <RecurringTaskCard novelId={id} />

      {/* Edit Dialog */}
      <Dialog open={editing} onOpenChange={(open) => !open && handleCancelEdit()}>
        <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden p-0 sm:max-w-4xl">
          <DialogHeader className="shrink-0 px-6 pt-6 pr-12">
            <DialogTitle>编辑小说信息</DialogTitle>
            <DialogDescription>基础信息会同步影响后续架构与导出内容。</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUpdate} className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 pb-4">
              <div className="space-y-2">
                <Label htmlFor="edit-title">标题</Label>
                <Input
                  id="edit-title"
                  value={editForm.title}
                  onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-desc">简介</Label>
                <Textarea
                  id="edit-desc"
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  rows={4}
                  placeholder="用几句话概括这部小说正在写什么。"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-genre">类型</Label>
                <Input
                  id="edit-genre"
                  value={editForm.genre}
                  onChange={(e) => setEditForm({ ...editForm, genre: e.target.value })}
                  placeholder="玄幻 / 科幻 / 都市..."
                />
              </div>
              <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
                <div>
                  <p className="text-sm font-medium">发布作品 ID</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    同一部小说在不同平台的作品 ID 在这里配置，平台启用状态仍在系统设置中管理。
                  </p>
                </div>
                {publishPlatforms.length ? (
                  publishPlatforms.map((platform) => {
                    const platformConfig = editForm.publishConfig?.[platform.key] || {};
                    return (
                      <div key={platform.key} className="flex items-center gap-3">
                        <Label className="w-20 shrink-0">{platform.name}</Label>
                        <Input
                          value={platformConfig.workId || ''}
                          onChange={(event) => setEditForm((current) => ({
                            ...current,
                            publishConfig: {
                              ...current.publishConfig,
                              [platform.key]: {
                                ...current.publishConfig?.[platform.key],
                                workId: event.target.value,
                              },
                            },
                          }))}
                          placeholder="平台上的作品/书籍 ID"
                        />
                      </div>
                    );
                  })
                ) : (
                  <p className="text-sm text-muted-foreground">暂无可配置的发布平台。</p>
                )}
              </div>
              <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
                <div>
                  <p className="text-sm font-medium">小说级 AI 配置</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    这里的配置会优先于系统设置。适合给当前小说单独指定模型和章节生成模板。
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>小说默认模型</Label>
                <Select
                  value={editForm.aiConfig?.defaultProfile?.provider || editForm.aiConfig?.defaultModel || '__default__'}
                  onValueChange={(value) => setEditForm((current) => ({
                    ...current,
                    aiConfig: {
                      ...current.aiConfig,
                      defaultModel: value === '__default__' ? '' : value,
                      defaultProfile: value === '__default__'
                        ? emptyProfile()
                        : {
                            ...normalizeProfile(current.aiConfig?.defaultProfile),
                            provider: value,
                          },
                    },
                  }))}
                >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__default__">继承系统默认模型</SelectItem>
                      {MODEL_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                      ))}
                    </SelectContent>
                </Select>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="novel-model-version">默认模型版本</Label>
                  <Input
                    id="novel-model-version"
                    value={editForm.aiConfig?.defaultProfile?.model || ''}
                    onChange={(event) => setEditForm((current) => ({
                      ...current,
                      aiConfig: {
                        ...current.aiConfig,
                        defaultProfile: {
                          ...normalizeProfile(current.aiConfig?.defaultProfile, current.aiConfig?.defaultModel),
                          model: event.target.value,
                        },
                      },
                    }))}
                    placeholder="例如 glm-5 / deepseek-v4-pro"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="novel-model-max-tokens">默认 Max Tokens</Label>
                  <Input
                    id="novel-model-max-tokens"
                    type="number"
                    min="1"
                    value={editForm.aiConfig?.defaultProfile?.maxTokens ?? ''}
                    onChange={(event) => setEditForm((current) => ({
                      ...current,
                      aiConfig: {
                        ...current.aiConfig,
                        defaultProfile: {
                          ...normalizeProfile(current.aiConfig?.defaultProfile, current.aiConfig?.defaultModel),
                          maxTokens: event.target.value,
                        },
                      },
                    }))}
                    placeholder="留空则使用默认值"
                  />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {GRAPH_MODEL_FIELDS.map((field) => (
                  <div key={field.key} className="space-y-2">
                    <Label>{field.label}</Label>
                    <div className="space-y-2 rounded-md border bg-background/70 p-3">
                      <Select
                        value={editForm.aiConfig?.graphModels?.[field.key]?.provider || '__default__'}
                        onValueChange={(value) => setEditForm((current) => ({
                          ...current,
                          aiConfig: {
                            ...current.aiConfig,
                            graphModels: {
                              ...current.aiConfig?.graphModels,
                              [field.key]: value === '__default__'
                                ? undefined
                                : {
                                    ...normalizeProfile(current.aiConfig?.graphModels?.[field.key]),
                                    provider: value,
                                  },
                            },
                          },
                        }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__default__">继承小说默认模型</SelectItem>
                          {MODEL_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {editForm.aiConfig?.graphModels?.[field.key]?.provider ? (
                        <>
                          <Input
                            value={editForm.aiConfig?.graphModels?.[field.key]?.model || ''}
                            onChange={(event) => setEditForm((current) => ({
                              ...current,
                              aiConfig: {
                                ...current.aiConfig,
                                graphModels: {
                                  ...current.aiConfig?.graphModels,
                                  [field.key]: {
                                    ...normalizeProfile(current.aiConfig?.graphModels?.[field.key]),
                                    model: event.target.value,
                                  },
                                },
                              },
                            }))}
                            placeholder="模型版本"
                          />
                          <Input
                            type="number"
                            min="1"
                            value={editForm.aiConfig?.graphModels?.[field.key]?.maxTokens ?? ''}
                            onChange={(event) => setEditForm((current) => ({
                              ...current,
                              aiConfig: {
                                ...current.aiConfig,
                                graphModels: {
                                  ...current.aiConfig?.graphModels,
                                  [field.key]: {
                                    ...normalizeProfile(current.aiConfig?.graphModels?.[field.key]),
                                    maxTokens: event.target.value,
                                  },
                                },
                              },
                            }))}
                            placeholder="Max Tokens"
                          />
                        </>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="novel-chapter-template">章节生成 Prompt 模板</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setEditForm((current) => ({
                        ...current,
                        aiConfig: {
                          ...current.aiConfig,
                          chapterGenerationPromptTemplate: DEFAULT_CHAPTER_GENERATION_PROMPT_TEMPLATE,
                        },
                      }))}
                    >
                      填入默认模板
                    </Button>
                  </div>
                  <Textarea
                    id="novel-chapter-template"
                    rows={14}
                    value={editForm.aiConfig?.chapterGenerationPromptTemplate || ''}
                    onChange={(event) => setEditForm((current) => ({
                      ...current,
                      aiConfig: {
                        ...current.aiConfig,
                        chapterGenerationPromptTemplate: event.target.value,
                      },
                    }))}
                    placeholder={`留空则继承系统默认模板。可用占位符：{{novelInfoSection}} {{chapterInfo}} {{userPromptSection}} {{prevChapterSection}} {{retrievalContextSection}} {{farContextSection}}`}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleCancelEdit}>
                取消
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                保存修改
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

export default NovelDetail;
