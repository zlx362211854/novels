export function PageShell({ eyebrow, title, description, actions, children }) {
  return (
    <div className="page-shell mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <section className="hero-panel relative overflow-hidden rounded-[36px] border border-[color:var(--border)] px-6 py-7 sm:px-8 sm:py-9">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            {eyebrow ? (
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.34em] text-[color:var(--ink-muted)]">
                {eyebrow}
              </p>
            ) : null}
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-[color:var(--ink)] sm:text-4xl">
              {title}
            </h1>
            {description ? (
              <p className="mt-4 max-w-2xl text-sm leading-8 text-[color:var(--ink-muted)] sm:text-base">
                {description}
              </p>
            ) : null}
          </div>
          {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
        </div>
      </section>
      <div className="mt-8 space-y-8">{children}</div>
    </div>
  );
}

export function SectionCard({ title, description, actions, children, tone = 'default' }) {
  const toneClass =
    tone === 'accent'
      ? 'border-[color:rgba(139,101,55,0.24)] bg-[linear-gradient(180deg,rgba(255,250,243,0.98),rgba(246,236,222,0.95))]'
      : tone === 'soft'
        ? 'border-[color:var(--border)] bg-[color:rgba(255,252,247,0.92)]'
        : 'border-[color:var(--border)] bg-[color:rgba(255,250,243,0.98)]';

  return (
    <section
      className={`section-shell rounded-[30px] border p-5 ${toneClass}`}
    >
      {(title || description || actions) && (
        <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-2xl">
            {title ? <h2 className="text-xl font-semibold tracking-[-0.02em] text-[color:var(--ink)]">{title}</h2> : null}
            {description ? (
              <p className="mt-2 text-sm leading-7 text-[color:var(--ink-muted)]">{description}</p>
            ) : null}
          </div>
          {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
        </div>
      )}
      {children}
    </section>
  );
}

export function StatGrid({ items }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item, index) => (
        <div
          key={`${item.label ?? 'stat'}-${index}`}
          className="rounded-[24px] border border-[color:var(--border)] bg-[color:rgba(255,252,246,0.92)] px-4 py-4 shadow-[0_10px_24px_rgba(38,28,18,0.04)]"
        >
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-[color:var(--ink-muted)]">
            {item.label}
          </p>
          <p className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-[color:var(--ink)] tabular-nums">
            {item.value}
          </p>
          {item.caption ? (
            <p className="mt-2 text-sm leading-6 text-[color:var(--ink-muted)]">{item.caption}</p>
          ) : null}
        </div>
      ))}
    </div>
  );
}
