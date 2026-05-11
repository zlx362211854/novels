import { cn } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function PageShell({ eyebrow, title, description, actions, children, density = 'default', className }) {
  const compact = density === 'compact';

  if (compact) {
    return (
      <div className={cn('mx-auto w-full max-w-[1360px] px-4 py-4 sm:px-6 lg:px-8', className)}>
        <div className="relative overflow-hidden rounded-lg border border-border/75 bg-card/62 px-4 py-3 shadow-sm backdrop-blur">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-amber-400 to-rose-400" />
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0 space-y-1">
              {eyebrow && (
                <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-primary/80">
                  {eyebrow}
                </p>
              )}
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                  {title}
                </h1>
                {description && (
                  <p className="max-w-4xl text-sm leading-6 text-muted-foreground">
                    {description}
                  </p>
                )}
              </div>
            </div>
            {actions && (
              <div className="flex shrink-0 flex-wrap gap-2 lg:justify-end">{actions}</div>
            )}
          </div>
        </div>
        <div className="mt-4 space-y-4">{children}</div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'mx-auto w-full px-4 sm:px-6 lg:px-8',
        'max-w-7xl py-6',
        className
      )}
    >
      <Card
        className="border-border/70 bg-gradient-to-br from-card via-secondary/50 to-accent/45 shadow-sm"
      >
        <CardHeader
          className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:space-y-0"
        >
          <div className="space-y-1.5">
            {eyebrow && (
                <p className="text-xs font-medium uppercase tracking-widest text-primary/80">
                {eyebrow}
              </p>
            )}
            <CardTitle
              className="text-2xl font-semibold tracking-tight sm:text-3xl"
            >
              {title}
            </CardTitle>
            {description && (
              <CardDescription
                className="max-w-3xl text-sm leading-relaxed"
              >
                {description}
              </CardDescription>
            )}
          </div>
          {actions && (
            <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">{actions}</div>
          )}
        </CardHeader>
      </Card>
      <div className="mt-6 space-y-6">{children}</div>
    </div>
  );
}

export function SectionCard({ title, description, actions, children, tone = 'default', className, contentClassName }) {
  const toneStyles = {
    default: 'workbench-surface bg-card/88 border-border/80 backdrop-blur',
    accent: 'bg-gradient-to-br from-primary/10 via-secondary/70 to-accent/55 border-primary/25',
    soft: 'bg-secondary/45 border-border/60',
  };

  return (
    <Card className={cn('shadow-sm', toneStyles[tone], className)}>
      {(title || description || actions) && (
        <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            {title && <CardTitle className="text-lg font-semibold text-foreground">{title}</CardTitle>}
            {description && (
              <CardDescription className="text-sm leading-relaxed">
                {description}
              </CardDescription>
            )}
          </div>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </CardHeader>
      )}
      <CardContent className={cn(title || description || actions ? 'pt-0' : '', contentClassName)}>
        {children}
      </CardContent>
    </Card>
  );
}

export function StatGrid({ items, compact = false }) {
  if (compact) {
    return (
      <div
        className={cn(
          'grid overflow-hidden rounded-lg border border-border/80 bg-card/86 shadow-sm backdrop-blur',
          items.length === 3 ? 'grid-cols-2 lg:grid-cols-3' : 'grid-cols-2 lg:grid-cols-4'
        )}
      >
        {items.map((item, index) => (
          <div
            key={`${item.label ?? 'stat'}-${index}`}
            className={cn(
              'border-r border-b border-border/70 px-4 py-3 last:border-r-0 lg:border-b-0',
              index % 2 === 0 ? 'bg-secondary/28' : 'bg-accent/22'
            )}
          >
            <p className="text-[11px] font-semibold uppercase tracking-wider text-primary/75">
              {item.label}
            </p>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <p className="text-xl font-semibold tracking-tight tabular-nums text-foreground">
                {item.value}
              </p>
              {item.caption && (
                <p className="text-xs text-muted-foreground">{item.caption}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'grid gap-3',
        compact
          ? items.length === 3
            ? 'grid-cols-2 lg:grid-cols-3'
            : 'grid-cols-2 lg:grid-cols-4'
          : items.length === 3
            ? 'md:grid-cols-3'
            : 'sm:grid-cols-2 lg:grid-cols-4'
      )}
    >
      {items.map((item, index) => (
        <Card
          size={compact ? 'sm' : 'default'}
          key={`${item.label ?? 'stat'}-${index}`}
          className={cn('border-border/50 bg-card shadow-sm', compact && 'rounded-lg')}
        >
          <CardHeader className={compact ? 'px-4 pb-1 pt-3' : 'pb-2'}>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {item.label}
            </p>
          </CardHeader>
          <CardContent className={compact ? 'px-4 pb-3' : undefined}>
            <p className={cn('font-semibold tracking-tight tabular-nums', compact ? 'text-xl' : 'text-2xl')}>
              {item.value}
            </p>
            {item.caption && (
              <p className={cn('mt-1 text-muted-foreground', compact ? 'text-xs' : 'text-sm')}>{item.caption}</p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
