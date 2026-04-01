import { useEffect, useMemo, useState } from 'react';
import { novelApi } from '../services/api';
import { useFeedback } from '../components/ui/FeedbackProvider';
import { PageShell, SectionCard, StatGrid } from '../components/ui/PageShell';
import { CreateNovelModal, NovelProjectCard } from '../components/ui/NovelListParts';

const dateFormatter = new Intl.DateTimeFormat('zh-CN', {
  month: 'short',
  day: 'numeric',
});

const getUpdatedTimestamp = (value) => {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
};

function NovelList() {
  const feedback = useFeedback();
  const [novels, setNovels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newNovel, setNewNovel] = useState({ title: '', description: '', genre: '' });

  useEffect(() => {
    loadNovels();
  }, []);

  const loadNovels = async () => {
    setLoading(true);
    try {
      const res = await novelApi.getAll();
      setNovels(res.data);
    } catch (error) {
      console.error('加载小说列表失败:', error);
      feedback.error('小说列表加载失败，请稍后重试。');
    } finally {
      setLoading(false);
    }
  };

  const sortedNovels = useMemo(() => {
    return [...novels].sort(
      (left, right) =>
        getUpdatedTimestamp(right.updated_at) - getUpdatedTimestamp(left.updated_at) || left.title.localeCompare(right.title)
    );
  }, [novels]);

  const stats = useMemo(() => {
    const genres = new Set(sortedNovels.map((novel) => novel.genre).filter(Boolean));
    const latestNovel = sortedNovels[0];
    return [
      { label: '项目总数', value: sortedNovels.length, caption: sortedNovels.length ? '所有进行中的小说项目' : '还没有创建项目' },
      { label: '已分类题材', value: genres.size, caption: '当前已使用的题材数量' },
      {
        label: '最近更新',
        value: latestNovel?.updated_at ? dateFormatter.format(new Date(latestNovel.updated_at)) : '-',
        caption: '按最近更新时间浏览更省心',
      },
    ];
  }, [sortedNovels]);

  const formatUpdatedAt = (value) => (value ? dateFormatter.format(new Date(value)) : '待更新');

  const handleCreate = async (event) => {
    event.preventDefault();
    if (!newNovel.title.trim()) {
      feedback.warning('请先填写小说标题。');
      return;
    }

    setCreating(true);
    try {
      await novelApi.create(newNovel);
      setNewNovel({ title: '', description: '', genre: '' });
      setShowCreate(false);
      feedback.success('新小说已创建。');
      loadNovels();
    } catch (error) {
      console.error('创建小说失败:', error);
      feedback.error(error.response?.data?.error || '创建失败，请稍后再试。');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (novel) => {
    const confirmed = await feedback.confirm({
      title: `删除「${novel.title}」？`,
      message: '删除后，这部小说的架构、章节和版本历史都会一并移除。',
      confirmText: '确认删除',
      cancelText: '保留项目',
      variant: 'danger',
    });
    if (!confirmed) return;

    try {
      await novelApi.delete(novel.id);
      feedback.success('小说项目已删除。');
      loadNovels();
    } catch (error) {
      console.error('删除小说失败:', error);
      feedback.error(error.response?.data?.error || '删除失败，请稍后再试。');
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-[color:var(--ink-muted)]">
        正在整理小说索引...
      </div>
    );
  }

  return (
    <PageShell
      eyebrow="Project Index"
      title="我的小说项目"
      description="把创作项目当成一页页可翻阅的工作文档。进入项目后，可以继续拆架构、写章节、回看版本。"
      actions={
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-[color:var(--ink-muted)]">新的项目会自动进入索引页，方便随时回到写作现场。</p>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="rounded-full bg-slate-500 px-4 py-2 text-sm font-medium text-white shadow-[0_12px_24px_rgba(38,28,18,0.14)] transition hover:translate-y-[-1px] hover:bg-[color:var(--accent)]"
          >
            创建新项目
          </button>
        </div>
      }
    >
      <StatGrid items={stats} />

      <SectionCard title="项目列表" description="最近更新的项目排在前面，方便回到正在推进的作品。">
        {sortedNovels.length === 0 ? (
          <div className="rounded-[32px] border border-dashed border-[color:rgba(216,203,184,0.92)] bg-[linear-gradient(180deg,rgba(255,252,247,0.92),rgba(247,239,226,0.86))] px-6 py-12 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]">
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.34em] text-[color:var(--ink-muted)]">Empty Index</p>
            <p className="mt-3 text-xl font-semibold tracking-[-0.03em] text-[color:var(--ink)]">还没有创建任何小说</p>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-[color:var(--ink-muted)]">
              先建立一个项目，再逐步补上简介、题材和章节结构。索引会把每个作品都整理成一张可继续推进的手稿卡片。
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className="rounded-full bg-slate-500 px-4 py-2 text-sm font-medium text-white shadow-[0_12px_24px_rgba(38,28,18,0.14)] transition hover:bg-[color:var(--accent)]"
              >
                创建第一个项目
              </button>
              <span className="rounded-full border border-[color:rgba(216,203,184,0.92)] bg-white/60 px-4 py-2 text-sm text-[color:var(--ink-muted)]">
                创建后可直接进入工作台继续写作
              </span>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {sortedNovels.map((novel) => (
              <NovelProjectCard
                key={novel.id}
                novel={novel}
                updatedLabel={formatUpdatedAt(novel.updated_at)}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </SectionCard>

      {showCreate ? (
        <CreateNovelModal
          creating={creating}
          newNovel={newNovel}
          onCancel={() => setShowCreate(false)}
          onChange={setNewNovel}
          onSubmit={handleCreate}
        />
      ) : null}
    </PageShell>
  );
}

export default NovelList;
