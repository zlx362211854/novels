import { useMemo, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { CheckCircle, AlertCircle, Expand, Shrink } from 'lucide-react';

function parseJson(value) {
  if (!value?.trim()) {
    return { ok: true, formatted: '' };
  }

  try {
    const parsed = JSON.parse(value);
    return {
      ok: true,
      formatted: JSON.stringify(parsed, null, 2),
    };
  } catch (error) {
    return { ok: false, message: error.message };
  }
}

export default function JsonField({
  label,
  value,
  onChange,
  placeholder,
  rows = 6,
  helper,
}) {
  const [expanded, setExpanded] = useState(false);
  const state = useMemo(() => parseJson(value), [value]);

  const handleFormat = () => {
    if (state.ok && state.formatted !== value) {
      onChange(state.formatted);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-xs uppercase tracking-wider">{label}</Label>
          {helper && <p className="mt-0.5 text-xs text-muted-foreground">{helper}</p>}
        </div>
        <div className="flex gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setExpanded((current) => !current)}
            className="h-7 px-2 text-xs"
          >
            {expanded ? (
              <>
                <Shrink className="mr-1 h-3 w-3" />
                收起
              </>
            ) : (
              <>
                <Expand className="mr-1 h-3 w-3" />
                展开
              </>
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleFormat}
            disabled={!state.ok || !value?.trim()}
            className="h-7 px-2 text-xs"
          >
            格式化
          </Button>
        </div>
      </div>
      <Textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={expanded ? rows + 5 : rows}
        className={cn(
          'font-mono text-sm',
          !state.ok && 'border-destructive focus-visible:ring-destructive'
        )}
        placeholder={placeholder}
      />
      <div className="flex items-center justify-between gap-3">
        <p
          className={cn(
            'flex items-center gap-1 text-xs',
            state.ok ? 'text-emerald-600' : 'text-destructive'
          )}
        >
          {state.ok ? (
            <>
              <CheckCircle className="h-3 w-3" />
              JSON 格式有效
            </>
          ) : (
            <>
              <AlertCircle className="h-3 w-3" />
              JSON 格式错误：{state.message}
            </>
          )}
        </p>
        {value?.trim() && (
          <p className="text-xs text-muted-foreground">{value.length} 个字符</p>
        )}
      </div>
    </div>
  );
}
