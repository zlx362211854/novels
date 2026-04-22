import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { architectureApi, chapterApi, multiChapterReviewApi } from '../services/api';
import { useFeedback } from '../components/ui/FeedbackProvider';
import { PageShell, SectionCard, StatGrid } from '../components/ui/PageShell';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ChevronRight, GitCompare, Plus, X } from 'lucide-react';

function ChapterManager() {
  const { id } = useParams();
  const navigate = useNavigate();
  const feedback = useFeedback();
  const [chapters, setChapters] = useState([]);
  const [architectures, setArchitectures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newChapter, setNewChapter] = useState({
    chapterNumber: 1,
    title: '',
    architectureId: null,
  });
  const [selectedChapterIds, setSelectedChapterIds] = useState(new Set());
  const [multiReviewing, setMultiReviewing] = useState(false);

  useEffect(() => {
    loadData();
  }, [id]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [chapterRes, archRes] = await Promise.all([
        chapterApi.getByNovelId(id),
        architectureApi.getByNovelId(id),
      ]);
      setChapters(chapterRes.data);
      setArchitectures(archRes.data);
      setNewChapter((prev) => ({
        ...prev,
        chapterNumber: Math.max(...chapterRes.data.map((chapter) => chapter.chapter_number || 0), 0) + 1,
      }));
    } catch (error) {
      console.error('加载数据失败:', error);
      feedback.error('章节列表加载失败，请稍后重试。');
    } finally {
      setLoading(false);
    }
  };

  const chapterArchs = architectures.filter((arch) => arch.level === 'chapter');

  const stats = useMemo(
    () => [
      { label: '章节总数', value: chapters.length, caption: '当前小说已有的章节' },
      { label: '草稿', value: chapters.filter((chapter) => chapter.status === 'draft').length, caption: '还需要继续写' },
      { label: '已生成', value: chapters.filter((chapter) => chapter.status === 'generated').length, caption: '已经有正文内容' },
    ],
    [chapters]
  );

  const nextChapterMap = useMemo(() => {
    const sorted = [...chapters].sort(
      (left, right) => (left.chapter_number || 0) - (right.chapter_number || 0)
    );
    const map = new Map();
    sorted.forEach((chapter, index) => {
      map.set(chapter.id, sorted[index + 1] || null);
    });
    return map;
  }, [chapters]);

  const handleCreate = async (event) => {
    event.preventDefault();
    setCreating(true);
    try {
      await chapterApi.create(id, {
        chapterNumber: newChapter.chapterNumber,
        title: newChapter.title,
        architectureId: newChapter.architectureId,
        status: 'draft',
      });
      setShowCreate(false);
      setNewChapter({
        chapterNumber: chapters.length + 2,
        title: '',
        architectureId: null,
      });
      feedback.success('新章节已创建。');
      loadData();
    } catch (error) {
      console.error('创建章节失败:', error);
      feedback.error(error.response?.data?.error || '创建章节失败，请稍后再试。');
    } finally {
      setCreating(false);
    }
  };

  const toggleChapter = (chapterId) => {
    setSelectedChapterIds((prev) => {
      const next = new Set(prev);
      if (next.has(chapterId)) {
        next.delete(chapterId);
      } else {
        next.add(chapterId);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedChapterIds.size === chapters.length) {
      setSelectedChapterIds(new Set());
    } else {
      setSelectedChapterIds(new Set(chapters.map((c) => c.id)));
    }
  };

  const handleMultiReview = async () => {
    setMultiReviewing(true);
    try {
      const res = await multiChapterReviewApi.start(id, Array.from(selectedChapterIds));
      navigate(`/novels/${id}/multi-chapter-review/${res.data.reviewId}`);
    } catch (error) {
      feedback.error(error.response?.data?.error || '发起审阅失败');
    } finally {
      setMultiReviewing(false);
    }
  };

  const multiReviewDisabled = selectedChapterIds.size < 2 || selectedChapterIds.size > 30 || multiReviewing;
  const multiReviewTitle =
    selectedChapterIds.size < 2
      ? '至少选择 2 章'
      : selectedChapterIds.size > 30
      ? '最多 30 章'
      : '跨章审阅';

  const handleDelete = async (chapter) => {
    const confirmed = await feedback.confirm({
      title: `删除第 ${chapter.chapter_number} 章？`,
      message: '删除后，这一章的正文与关联内容都会被移除。',
      confirmText: '确认删除',
      cancelText: '保留章节',
      variant: 'danger',
    });
    if (!confirmed) return;

    try {
      await chapterApi.delete(chapter.id);
      feedback.success('章节已删除。');
      loadData();
    } catch (error) {
      console.error('删除章节失败:', error);
      feedback.error(error.response?.data?.error || '删除失败，请稍后再试。');
    }
  };

  if (loading) {
    return <div className="flex min-h-[50vh] items-center justify-center text-slate-500">正在加载章节列表...</div>;
  }

  return (
    <PageShell
      eyebrow="Chapter Index"
      title="章节列表"
      description="这里适合集中查看所有章节状态；如果你已经有章架构，优先从架构页进入正文生产会更顺。"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link to={`/novels/${id}`} className="flex items-center justify-center">
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              返回
            </Link>
          </Button>
          <div className="h-4 w-px bg-border" />
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            新建章节
          </Button>
        </div>
      }
    >
      <StatGrid items={stats} />

      <SectionCard
        title="章节清单"
        description="手动创建更适合补缺口；大批量正文建议回到架构页统一生成。"
        actions={
          chapters.length > 0 ? (
            <button
              type="button"
              onClick={toggleSelectAll}
              className="flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
            >
              <input
                type="checkbox"
                readOnly
                checked={selectedChapterIds.size === chapters.length && chapters.length > 0}
                className="pointer-events-none h-3.5 w-3.5 accent-primary"
              />
              全选
            </button>
          ) : null
        }
      >
        {chapters.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center">
            <p className="text-lg font-semibold text-slate-800">还没有章节</p>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              如果已经有章架构，可以直接去架构页生成正文；如果只是临时补一章，也可以在这里手动创建。
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {chapters.map((chapter) => (
              <div key={chapter.id} className="flex flex-col gap-3 rounded-[24px] border border-slate-200 bg-white px-5 py-4 shadow-[0_12px_32px_rgba(15,23,42,0.04)] md:flex-row md:items-center md:justify-between">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <input
                    type="checkbox"
                    checked={selectedChapterIds.has(chapter.id)}
                    onChange={() => toggleChapter(chapter.id)}
                    className="h-4 w-4 shrink-0 cursor-pointer accent-primary"
                  />
                  <Link to={`/chapters/${chapter.id}`} className="min-w-0 flex-1">
                    <p className="text-base font-semibold text-slate-900">
                      第{chapter.chapter_number}章 · {chapter.title || '未命名'}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      {chapter.content ? `${chapter.content.length} 字` : '还没有正文内容'}
                    </p>
                  </Link>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  {nextChapterMap.get(chapter.id) ? (
                    <Button variant="outline" size="sm" asChild>
                      <Link to={`/chapters/${nextChapterMap.get(chapter.id).id}`}>
                        下一章
                        <ChevronRight className="ml-1.5 h-4 w-4" />
                      </Link>
                    </Button>
                  ) : null}
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${chapter.status === 'generated' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
                    }`}>
                    {chapter.status === 'generated' ? '已生成' : '草稿'}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleDelete(chapter)}
                    className="rounded-full border border-rose-200 px-3 py-1.5 text-sm font-medium text-rose-600 transition hover:bg-rose-50"
                  >
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Floating multi-select action bar */}
      {selectedChapterIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
          <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-3 shadow-2xl shadow-slate-900/15">
            <span className="text-sm font-medium text-slate-700">
              已选 {selectedChapterIds.size} 章
            </span>
            <div className="h-4 w-px bg-slate-200" />
            <Button
              size="sm"
              disabled={multiReviewDisabled}
              title={multiReviewTitle}
              onClick={handleMultiReview}
            >
              <GitCompare className="mr-1.5 h-4 w-4" />
              {multiReviewing ? '发起中...' : '跨章审阅'}
            </Button>
            <button
              type="button"
              onClick={() => setSelectedChapterIds(new Set())}
              className="flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
            >
              <X className="h-3.5 w-3.5" />
              取消选择
            </button>
          </div>
        </div>
      )}

      {showCreate ? (
        <div className="fixed inset-0 z-[75] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-[32px] border border-white/60 bg-white p-6 shadow-2xl">
            <div className="mb-5">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Create Chapter</p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-900">手动创建章节</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                手动创建适合补空位或插入过渡章；如果已经有章架构，记得顺手挂上关联，方便后续重生成。
              </p>
            </div>
            <form onSubmit={handleCreate} className="space-y-4">
              <label className="grid gap-2">
                <span className="text-sm font-medium text-slate-700">章节序号</span>
                <input
                  type="number"
                  min="1"
                  value={newChapter.chapterNumber}
                  onChange={(event) => setNewChapter({ ...newChapter, chapterNumber: parseInt(event.target.value || '1', 10) })}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-sky-400"
                  required
                />
              </label>
              <label className="grid gap-2">
                <span className="text-sm font-medium text-slate-700">章节标题</span>
                <input
                  type="text"
                  value={newChapter.title}
                  onChange={(event) => setNewChapter({ ...newChapter, title: event.target.value })}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-sky-400"
                  placeholder="例如：风雪夜归人"
                />
              </label>
              <label className="grid gap-2">
                <span className="text-sm font-medium text-slate-700">关联章架构</span>
                <select
                  value={newChapter.architectureId || ''}
                  onChange={(event) => setNewChapter({ ...newChapter, architectureId: event.target.value ? parseInt(event.target.value, 10) : null })}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-sky-400"
                >
                  <option value="">不关联</option>
                  {chapterArchs.map((arch) => (
                    <option key={arch.id} value={arch.id}>
                      {arch.title}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex flex-wrap justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="rounded-full bg-slate-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {creating ? '创建中...' : '创建章节'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </PageShell>
  );
}

export default ChapterManager;
