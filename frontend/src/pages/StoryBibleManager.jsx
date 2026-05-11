import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { novelApi, storyBibleApi } from '../services/api';
import { useFeedback } from '../components/ui/FeedbackProvider';
import { PageShell, SectionCard } from '../components/ui/PageShell';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import { Card, CardContent } from '../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import {
  ArrowLeft,
  BookMarked,
  Eye,
  FilePlus2,
  Loader2,
  Save,
  Search,
  Trash2,
} from 'lucide-react';

const TYPE_OPTIONS = [
  { value: 'world_rule', label: '世界规则' },
  { value: 'character_rule', label: '人物设定' },
  { value: 'timeline_fact', label: '时间线事实' },
  { value: 'foreshadow_plan', label: '伏笔计划' },
  { value: 'taboo', label: '禁改规则' },
  { value: 'knowledge_boundary', label: '认知边界' },
];

const EMPTY_FORM = {
  title: '',
  type: 'world_rule',
  priority: 100,
  labelsText: '',
  content: '',
};

function normalizeForm(entry) {
  if (!entry) return EMPTY_FORM;
  return {
    title: entry.title || '',
    type: entry.type || 'world_rule',
    priority: Number.isFinite(entry.priority) ? Number(entry.priority) : 100,
    labelsText: Array.isArray(entry.labels) ? entry.labels.join('，') : '',
    content: entry.content || '',
  };
}

function normalizeEntryPayload(form) {
  return {
    title: form.title.trim(),
    type: form.type,
    priority: Number.isFinite(Number(form.priority)) ? Number(form.priority) : 100,
    labels: form.labelsText
      .split(/[,，\n]/)
      .map((item) => item.trim())
      .filter(Boolean),
    content: form.content.trim(),
  };
}

function getOptionLabel(options, value, fallback = '') {
  return options.find((option) => option.value === value)?.label || fallback || value;
}

function StoryBibleManager() {
  const { id } = useParams();
  const feedback = useFeedback();
  const [novel, setNovel] = useState(null);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    loadData();
  }, [id]);

  useEffect(() => {
    const selected = entries.find((entry) => entry.id === selectedId) || null;
    setForm(normalizeForm(selected));
  }, [entries, selectedId]);

  const selectedEntry = useMemo(
    () => entries.find((entry) => entry.id === selectedId) || null,
    [entries, selectedId]
  );

  const dirty = useMemo(() => {
    return JSON.stringify(normalizeEntryPayload(form)) !== JSON.stringify(normalizeEntryPayload(normalizeForm(selectedEntry)));
  }, [form, selectedEntry]);

  const filteredEntries = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return entries.filter((entry) => {
      if (typeFilter !== 'all' && entry.type !== typeFilter) return false;
      if (!keyword) return true;
      const haystack = [
        entry.title,
        entry.content,
        entry.type,
        ...(entry.labels || []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(keyword);
    });
  }, [entries, search, typeFilter]);

  async function loadData() {
    setLoading(true);
    try {
      const [novelRes, entriesRes] = await Promise.all([
        novelApi.getById(id),
        storyBibleApi.listByNovelId(id),
      ]);
      setNovel(novelRes.data);
      setEntries(entriesRes.data);
      setSelectedId((current) => {
        if (current && entriesRes.data.some((entry) => entry.id === current)) return current;
        return entriesRes.data[0]?.id ?? null;
      });
    } catch (error) {
      console.error('加载故事圣经失败:', error);
      feedback.error('故事圣经加载失败，请稍后重试。');
    } finally {
      setLoading(false);
    }
  }

  async function confirmDiscardIfNeeded() {
    if (!dirty) return true;
    return await feedback.confirm({
      title: '放弃未保存修改？',
      message: '当前条目还有未保存的改动，切换后这些修改会丢失。',
      confirmText: '放弃修改',
      cancelText: '继续编辑',
    });
  }

  async function handleSelectEntry(entryId) {
    if (entryId === selectedId) return;
    const confirmed = await confirmDiscardIfNeeded();
    if (!confirmed) return;
    setSelectedId(entryId);
  }

  async function handleCreate() {
    const confirmed = await confirmDiscardIfNeeded();
    if (!confirmed) return;

    setCreating(true);
    try {
      const response = await storyBibleApi.create(id, {
        title: '未命名条目',
        type: 'world_rule',
        priority: 100,
        labels: [],
        content: '',
      });
      const created = response.data;
      setEntries((current) => [created, ...current]);
      setSelectedId(created.id);
      feedback.success('已新建故事圣经条目。');
    } catch (error) {
      console.error('创建故事圣经条目失败:', error);
      feedback.error(error.response?.data?.error || '创建失败，请稍后再试。');
    } finally {
      setCreating(false);
    }
  }

  async function handleSave() {
    if (!selectedEntry) {
      feedback.warning('请先选择一个故事圣经条目。');
      return;
    }

    const payload = normalizeEntryPayload(form);
    if (!payload.title) {
      feedback.warning('请先填写条目标题。');
      return;
    }

    setSaving(true);
    try {
      const response = await storyBibleApi.update(id, selectedEntry.id, payload);
      const updated = response.data;
      setEntries((current) =>
        current.map((entry) => (entry.id === updated.id ? updated : entry))
      );
      feedback.success('故事圣经条目已保存。');
    } catch (error) {
      console.error('保存故事圣经条目失败:', error);
      feedback.error(error.response?.data?.error || '保存失败，请稍后再试。');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!selectedEntry) return;
    const confirmed = await feedback.confirm({
      title: `删除「${selectedEntry.title || '未命名条目'}」？`,
      message: '删除后，这条故事圣经将不再参与 RAG 检索与生成约束。',
      note: '如果这条设定已经被正文依赖，建议先确认后续章节是否还需要它。',
      confirmText: '确认删除',
      cancelText: '取消',
      variant: 'danger',
    });

    if (!confirmed) return;

    try {
      await storyBibleApi.delete(id, selectedEntry.id);
      setEntries((current) => current.filter((entry) => entry.id !== selectedEntry.id));
      setSelectedId((current) => {
        if (current !== selectedEntry.id) return current;
        const next = entries.filter((entry) => entry.id !== selectedEntry.id);
        return next[0]?.id ?? null;
      });
      feedback.success('故事圣经条目已删除。');
    } catch (error) {
      console.error('删除故事圣经条目失败:', error);
      feedback.error(error.response?.data?.error || '删除失败，请稍后再试。');
    }
  }

  if (loading) {
    return (
      <PageShell eyebrow="Story Bible" title="加载中..." description="">
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell
      eyebrow="Story Bible"
      title={novel ? `${novel.title} · 故事圣经` : '故事圣经'}
      description="把整本书不该写错的设定集中维护。生成章节时，系统会默认把这些条目都作为 RAG 约束使用。"
      density="compact"
      actions={
        <>
          <Button variant="ghost" size="sm" asChild>
            <Link to={`/novels/${id}`}>
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              返回小说
            </Link>
          </Button>
          <Button variant="outline" size="sm" onClick={handleCreate} disabled={creating}>
            {creating ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <FilePlus2 className="mr-1.5 h-4 w-4" />}
            新增条目
          </Button>
        </>
      }
    >
      <div className="grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
        <SectionCard
          title="条目列表"
          description={`${entries.length} 条设定，适合先筛选再编辑。`}
          tone="soft"
        >
          <div className="space-y-4">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="搜索标题、内容、标签"
                className="pl-9"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-1 xl:grid-cols-1">
              <div className="space-y-1.5">
                <Label>类型</Label>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="w-full">
                    <SelectValue>{getOptionLabel([{ value: 'all', label: '全部类型' }, ...TYPE_OPTIONS], typeFilter, '全部类型')}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部类型</SelectItem>
                    {TYPE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-3">
              {filteredEntries.length === 0 ? (
                <div className="rounded-xl border border-dashed border-primary/25 bg-secondary/35 px-4 py-8 text-center text-sm text-muted-foreground">
                  当前筛选下没有条目。
                </div>
              ) : (
                filteredEntries.map((entry) => {
                  const isActive = entry.id === selectedId;
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => handleSelectEntry(entry.id)}
                      className={`relative w-full rounded-lg border px-4 py-3 text-left transition ${
                        isActive
                          ? 'border-primary/30 bg-card shadow-sm shadow-primary/10 before:absolute before:inset-y-3 before:left-0 before:w-1 before:rounded-r-full before:bg-primary'
                          : 'border-border/80 bg-card/72 hover:border-primary/25 hover:bg-accent/28'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="line-clamp-1 font-semibold">{entry.title || '未命名条目'}</p>
                          <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                            {entry.content || '还没有填写内容。'}
                          </p>
                        </div>
                        <span className="shrink-0 text-xs text-slate-400">
                          P{entry.priority ?? 100}
                        </span>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <Badge variant="outline">{entry.type}</Badge>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title={selectedEntry ? '编辑条目' : '故事圣经编辑器'}
          description={
            selectedEntry
              ? dirty
                ? '有未保存修改，保存后才会进入后续生成约束。'
                : '当前内容已保存，会参与后续 RAG 约束。'
              : '先新建一个条目，再开始编辑设定。'
          }
          actions={
            selectedEntry ? (
              <>
                <Badge variant={dirty ? 'secondary' : 'outline'} className={dirty ? 'bg-amber-100 text-amber-700' : ''}>
                  {dirty ? '未保存' : '已保存'}
                </Badge>
                <Button variant="outline" size="sm" onClick={handleDelete}>
                  <Trash2 className="mr-1.5 h-4 w-4" />
                  删除
                </Button>
                <Button size="sm" onClick={handleSave} disabled={saving}>
                  {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
                  保存
                </Button>
              </>
            ) : null
          }
        >
          {!selectedEntry ? (
            <div className="flex min-h-[420px] flex-col items-center justify-center rounded-2xl border border-dashed border-primary/25 bg-secondary/35 px-6 text-center">
              <BookMarked className="mb-4 h-10 w-10 text-slate-400" />
              <p className="text-base font-medium text-slate-700">还没有选中条目</p>
              <p className="mt-2 max-w-md text-sm text-slate-500">
                先在左侧选择一个条目，或新建一条人物设定、世界规则、伏笔计划，再开始编辑。
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="story-bible-title">标题</Label>
                  <Input
                    id="story-bible-title"
                    value={form.title}
                    onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                    placeholder="例如：玄铁令门规 / 林霄早期信条 / 青溪血战后的伤势"
                  />
                </div>

                <div className="space-y-2">
                  <Label>类型</Label>
                  <Select value={form.type} onValueChange={(value) => setForm((current) => ({ ...current, type: value }))}>
                    <SelectTrigger className="w-full">
                      <SelectValue>{getOptionLabel(TYPE_OPTIONS, form.type, '世界规则')}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {TYPE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>优先级</Label>
                  <Input
                    type="number"
                    min="1"
                    value={form.priority}
                    onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value }))}
                  />
                </div>

              </div>

              <div className="space-y-2">
                <Label htmlFor="story-bible-labels">标签</Label>
                <Input
                  id="story-bible-labels"
                  value={form.labelsText}
                  onChange={(event) => setForm((current) => ({ ...current, labelsText: event.target.value }))}
                  placeholder="用逗号分隔，例如：林霄，玄铁佩，临安"
                />
                <p className="text-xs text-slate-500">标签会帮助检索更快命中相关人物、地点、物品和伏笔。</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="story-bible-content">正文内容</Label>
                <Textarea
                  id="story-bible-content"
                  value={form.content}
                  onChange={(event) => setForm((current) => ({ ...current, content: event.target.value }))}
                  rows={16}
                  placeholder="写下这条设定的完整内容，尽量明确人物、地点、物品和规则边界。"
                />
              </div>

              <Card className="border-border/80 bg-secondary/35 shadow-none">
                <CardContent className="space-y-3 py-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                    <Eye className="h-4 w-4" />
                    进入生成时的默认规则
                  </div>
                  <div className="space-y-2 text-sm text-slate-600">
                    <p>所有故事圣经条目都会默认进入 RAG，用来约束后续章节生成、审核、修订与微调。</p>
                    <p>优先级越高，越容易在检索结果里排到前面。</p>
                  </div>
                </CardContent>
              </Card>

              <div className="flex items-center justify-between rounded-xl border bg-accent/28 px-4 py-3">
                <p className="text-sm text-slate-600">
                  {dirty ? '当前有未保存修改。' : '当前内容已与服务器同步。'}
                </p>
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
                  保存条目
                </Button>
              </div>
            </div>
          )}
        </SectionCard>
      </div>
    </PageShell>
  );
}

export default StoryBibleManager;
