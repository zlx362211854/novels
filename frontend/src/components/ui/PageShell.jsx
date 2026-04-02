import { cn } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function PageShell({ eyebrow, title, description, actions, children }) {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <Card className="border-border/50 bg-gradient-to-br from-slate-50 to-slate-100/50 shadow-sm">
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
          <div className="space-y-1.5">
            {eyebrow && (
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                {eyebrow}
              </p>
            )}
            <CardTitle className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {title}
            </CardTitle>
            {description && (
              <CardDescription className="max-w-2xl text-sm leading-relaxed">
                {description}
              </CardDescription>
            )}
          </div>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </CardHeader>
      </Card>
      <div className="mt-6 space-y-6">{children}</div>
    </div>
  );
}

export function SectionCard({ title, description, actions, children, tone = 'default' }) {
  const toneStyles = {
    default: 'bg-card border-border',
    accent: 'bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20',
    soft: 'bg-muted/30 border-border/50',
  };

  return (
    <Card className={cn('shadow-sm', toneStyles[tone])}>
      {(title || description || actions) && (
        <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            {title && <CardTitle className="text-lg font-semibold">{title}</CardTitle>}
            {description && (
              <CardDescription className="text-sm leading-relaxed">
                {description}
              </CardDescription>
            )}
          </div>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </CardHeader>
      )}
      <CardContent className={title || description || actions ? 'pt-0' : ''}>
        {children}
      </CardContent>
    </Card>
  );
}

export function StatGrid({ items }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item, index) => (
        <Card
          key={`${item.label ?? 'stat'}-${index}`}
          className="border-border/50 bg-card shadow-sm"
        >
          <CardHeader className="pb-2">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {item.label}
            </p>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tracking-tight tabular-nums">
              {item.value}
            </p>
            {item.caption && (
              <p className="mt-1 text-sm text-muted-foreground">{item.caption}</p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
