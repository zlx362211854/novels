import { Link } from 'react-router-dom';

export function NovelProjectCard({ novel, updatedLabel, onDelete }) {
  return (
    <article className="group rounded-[32px] border border-[color:rgba(216,203,184,0.84)] bg-[linear-gradient(180deg,rgba(255,252,247,0.98),rgba(247,239,226,0.92))] p-5 shadow-[0_16px_40px_rgba(38,28,18,0.06)] transition duration-200 hover:-translate-y-1 hover:border-[color:rgba(139,101,55,0.28)] hover:shadow-[0_20px_48px_rgba(38,28,18,0.1)]">
      <div className="flex items-start justify-between gap-3 border-b border-[color:rgba(216,203,184,0.5)] pb-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-[0.7rem] font-semibold uppercase tracking-[0.24em] text-[color:var(--ink-muted)]">
            <span>Manuscript Sheet</span>
            <span className="h-1 w-1 rounded-full bg-[color:rgba(139,101,55,0.38)]" />
            <span>{updatedLabel}</span>
          </div>
          <h2 className="mt-3 text-[1.45rem] font-semibold tracking-[-0.03em] text-[color:var(--ink)]">{novel.title}</h2>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {novel.genre ? (
              <span className="inline-flex rounded-full border border-[color:rgba(139,101,55,0.18)] bg-[color:rgba(139,101,55,0.08)] px-3 py-1 text-xs font-semibold text-[color:var(--accent)]">
                {novel.genre}
              </span>
            ) : (
              <span className="inline-flex rounded-full border border-dashed border-[color:rgba(216,203,184,0.9)] px-3 py-1 text-xs font-semibold text-[color:var(--ink-muted)]">
                未设置题材
              </span>
            )}
            <span className="text-xs text-[color:var(--ink-muted)]">可继续进入写作工作台</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onDelete(novel)}
          className="rounded-full border border-[color:rgba(169,77,68,0.22)] px-3 py-1.5 text-xs font-medium text-[color:var(--danger)] transition hover:bg-[color:rgba(169,77,68,0.08)]"
        >
          删除
        </button>
      </div>
      <p className="mt-5 line-clamp-4 text-sm leading-7 text-[color:var(--ink-muted)]">
        {novel.description || '还没有简介。补充简介会帮助后续 AI 更快进入写作上下文。'}
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[color:rgba(216,203,184,0.5)] pt-4 text-sm text-[color:var(--ink-muted)]">
        <span>最后整理于 {updatedLabel}</span>
        <Link
          to={`/novels/${novel.id}`}
          className="rounded-full bg-slate-500 px-3.5 py-2 font-medium text-white shadow-[0_10px_22px_rgba(38,28,18,0.14)] transition hover:translate-y-[-1px] hover:bg-[color:var(--accent)]"
        >
          进入工作台
        </Link>
      </div>
    </article>
  );
}

export function CreateNovelModal({ creating, newNovel, onCancel, onChange, onSubmit }) {
  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center bg-[color:rgba(15,23,42,0.5)] p-4 backdrop-blur-md">
      <div className="w-full max-w-xl rounded-[34px] border border-[color:rgba(255,255,255,0.72)] bg-[linear-gradient(180deg,rgba(255,252,247,0.98),rgba(247,239,226,0.96))] p-6 shadow-[0_34px_90px_rgba(15,23,42,0.24)]">
        <div className="mb-6">
          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.34em] text-[color:var(--ink-muted)]">Create Project</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[color:var(--ink)]">创建新小说</h2>
          <p className="mt-2 text-sm leading-7 text-[color:var(--ink-muted)]">
            先给项目一个标题和一句简介，后面可以继续补全世界观和章节结构。我们会把它整理成独立的手稿条目。
          </p>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <label className="grid gap-2">
            <span className="text-sm font-medium text-[color:var(--ink)]">标题</span>
            <input
              type="text"
              value={newNovel.title}
              onChange={(event) => onChange({ ...newNovel, title: event.target.value })}
              className="rounded-2xl border border-[color:rgba(216,203,184,0.88)] bg-white px-4 py-3 outline-none transition focus:border-[color:rgba(139,101,55,0.42)]"
              required
            />
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-medium text-[color:var(--ink)]">简介</span>
            <textarea
              value={newNovel.description}
              onChange={(event) => onChange({ ...newNovel, description: event.target.value })}
              rows={4}
              className="rounded-2xl border border-[color:rgba(216,203,184,0.88)] bg-white px-4 py-3 outline-none transition focus:border-[color:rgba(139,101,55,0.42)]"
              placeholder="一句话说明这部小说在讲什么。"
            />
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-medium text-[color:var(--ink)]">题材</span>
            <input
              type="text"
              value={newNovel.genre}
              onChange={(event) => onChange({ ...newNovel, genre: event.target.value })}
              className="rounded-2xl border border-[color:rgba(216,203,184,0.88)] bg-white px-4 py-3 outline-none transition focus:border-[color:rgba(139,101,55,0.42)]"
              placeholder="玄幻 / 科幻 / 悬疑..."
            />
          </label>
          <div className="mt-2 flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-full border border-[color:rgba(216,203,184,0.9)] px-4 py-2 text-sm font-medium text-[color:var(--ink-muted)] transition hover:bg-[color:rgba(255,255,255,0.7)] hover:text-[color:var(--ink)]"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={creating}
              className="rounded-full bg-slate-500 px-4 py-2 text-sm font-medium text-white shadow-[0_12px_24px_rgba(38,28,18,0.14)] transition hover:bg-[color:var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {creating ? '创建中...' : '创建项目'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
