import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { architectureApi, chapterApi, exportApi, novelApi } from '../services/api';
import { useFeedback } from '../components/ui/FeedbackProvider';
import { PageShell, SectionCard, StatGrid } from '../components/ui/PageShell';

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
  const [editForm, setEditForm] = useState({ title: '', description: '', genre: '' });

  useEffect(() => {
    loadData();
  }, [id]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [novelRes, archRes, chapterRes] = await Promise.all([
        novelApi.getById(id),
        architectureApi.getByNovelId(id),
        chapterApi.getByNovelId(id),
      ]);
      setNovel(novelRes.data);
      setArchitectures(archRes.data);
      setChapters(chapterRes.data);
      setEditForm({
        title: novelRes.data.title,
        description: novelRes.data.description || '',
        genre: novelRes.data.genre || '',
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
      await novelApi.update(id, editForm);
      setNovel((current) => ({ ...current, ...editForm }));
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
      feedback.success(scope === 'full' ? '已开始导出整本 Markdown。' : '已开始导出当前内容。');
    } catch (error) {
      console.error('导出失败:', error);
      feedback.error('导出失败，可能是导出接口尚未可用。');
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

    return {
      full,
      volume,
      chapterArch,
      generated,
      draft,
      progress: chapters.length ? Math.round((generated / chapters.length) * 100) : 0,
    };
  }, [architectures, chapters]);

  if (loading) {
    return <div className="flex min-h-[50vh] items-center justify-center text-slate-500">正在加载工作台...</div>;
  }

  if (!novel) {
    return <div className="py-20 text-center text-slate-500">小说不存在</div>;
  }

  return (
    <PageShell
      eyebrow="Novel Workspace"
      title={novel.title}
      description={novel.description || '先搭骨架，再生成章节，再统一回看节奏和完整度。这里把项目进度集中展示，减少来回跳转。'}
      actions={
        <>
          <Link
            to="/"
            className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:bg-white"
          >
            返回列表
          </Link>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-white"
          >
            编辑信息
          </button>
          <button
            type="button"
            onClick={() => handleExport('full')}
            disabled={exporting}
            className="rounded-full bg-slate-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {exporting ? '导出中...' : '导出 Markdown'}
          </button>
          <Link
            to={`/novels/${id}/architecture`}
            className="rounded-full bg-sky-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-700"
          >
            打开完整架构页
          </Link>
        </>
      }
    >
      {editing ? (
        <SectionCard title="编辑小说信息" description="基础信息会同步影响后续架构与导出内容。">
          <form onSubmit={handleUpdate} className="grid gap-4">
            <label className="grid gap-2">
              <span className="text-sm font-medium text-slate-700">标题</span>
              <input
                type="text"
                value={editForm.title}
                onChange={(event) => setEditForm({ ...editForm, title: event.target.value })}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-sky-400"
                required
              />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-medium text-slate-700">简介</span>
              <textarea
                value={editForm.description}
                onChange={(event) => setEditForm({ ...editForm, description: event.target.value })}
                rows={4}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-sky-400"
                placeholder="用几句话概括这部小说正在写什么。"
              />
            </label>
            <label className="grid gap-2 sm:max-w-xs">
              <span className="text-sm font-medium text-slate-700">类型</span>
              <input
                type="text"
                value={editForm.genre}
                onChange={(event) => setEditForm({ ...editForm, genre: event.target.value })}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-sky-400"
                placeholder="玄幻 / 科幻 / 都市..."
              />
            </label>
            <div className="flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={handleCancelEdit}
                className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-full bg-sky-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? '保存中...' : '保存修改'}
              </button>
            </div>
          </form>
        </SectionCard>
      ) : null}

      <SectionCard tone="accent">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">当前进度</p>
            <div className="mt-3 flex items-end gap-3">
              <span className="text-5xl font-semibold text-slate-900">{summary.progress}%</span>
              <p className="pb-2 text-sm text-slate-500">
                已完成 {summary.generated} / {chapters.length || 0} 章正文
              </p>
            </div>
          </div>
          <div className="w-full max-w-md">
            <div className="h-3 rounded-full bg-white/80">
              <div
                className="h-3 rounded-full bg-slate-500 transition-all"
                style={{ width: `${summary.progress}%` }}
              />
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              如果先把“全本 {'->'} 卷 {'->'} 章”三层架构补齐，再进入正文生成，后面的 AI 质量会更稳定。
            </p>
          </div>
        </div>
      </SectionCard>
      <StatGrid
        items={[
          { label: '全本架构', value: summary.full, caption: summary.full ? '小说总纲已建立' : '建议先补全总纲' },
          { label: '卷架构', value: summary.volume, caption: '管理中篇节奏和篇章分区' },
          { label: '章架构', value: summary.chapterArch, caption: '越完整，越利于批量生产' },
          { label: '已生成章节', value: summary.generated, caption: `${summary.draft} 章仍处于草稿` },
        ]}
      />
      <SectionCard
        title="继续创作"
        description="小说详情页现在只做轻量概览。真正的结构调整、拆章和正文生成都从完整架构页进入。"
        actions={
          <Link
            to={`/novels/${id}/architecture`}
            className="rounded-full bg-sky-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-sky-700"
          >
            继续创作
          </Link>
        }
      >
        <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[24px] border border-slate-200 bg-slate-50/70 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">推荐路径</p>
            <div className="mt-4 space-y-3 text-sm leading-7 text-slate-600">
              <p>
                {summary.full
                  ? '总纲已经有了，下一步建议直接进入完整架构页，检查卷与章的承接，再决定是否生成正文。'
                  : '当前还没有全本架构，建议先进入完整架构页把总纲搭起来，再继续后面的章节生产。'}
              </p>
              <p>
                现在所有高频动作都集中在完整架构页里：补结构、拆章、单章试产、批量出稿。
              </p>
            </div>
          </div>
          <div className="rounded-[24px] border border-slate-200 bg-white p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">项目信息</p>
            <div className="mt-4 space-y-4 text-sm leading-7 text-slate-600">
              <div>
                <p className="text-slate-400">类型</p>
                <p className="text-base text-slate-800">{novel.genre || '未设置'}</p>
              </div>
              <div>
                <p className="text-slate-400">简介</p>
                <p>{novel.description || '还没有填写简介。补上简介后，AI 更容易抓到故事核心。'}</p>
              </div>
              <div>
                <p className="text-slate-400">当前状态</p>
                <p className="text-slate-800">
                  {chapters.length
                    ? `已完成 ${summary.generated} / ${chapters.length} 章正文`
                    : '还没有章节，建议先从完整架构页开始'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </SectionCard>
    </PageShell>
  );
}

export default NovelDetail;
