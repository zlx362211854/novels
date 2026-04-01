import { useMemo, useState } from 'react';

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
    <div className="rounded-[26px] border border-[color:var(--border)] bg-[color:rgba(255,250,243,0.95)] p-4 shadow-[0_12px_28px_rgba(38,28,18,0.04)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <label className="block text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-[color:var(--ink-muted)]">
            {label}
          </label>
          {helper ? <p className="mt-1 text-xs leading-6 text-[color:var(--ink-muted)]">{helper}</p> : null}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setExpanded((current) => !current)}
            className="rounded-full border border-[color:var(--border)] bg-[rgba(255,255,255,0.6)] px-3 py-1.5 text-xs font-medium text-[color:var(--ink-muted)] transition hover:border-[color:rgba(139,101,55,0.35)] hover:bg-white"
          >
            {expanded ? '收起' : '展开'}
          </button>
          <button
            type="button"
            onClick={handleFormat}
            disabled={!state.ok || !value?.trim()}
            className="rounded-full border border-[color:var(--border)] bg-[rgba(255,255,255,0.72)] px-3 py-1.5 text-xs font-medium text-[color:var(--ink-muted)] transition hover:border-[color:rgba(139,101,55,0.35)] hover:bg-white disabled:cursor-not-allowed disabled:opacity-45"
          >
            格式化
          </button>
        </div>
      </div>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={expanded ? rows + 5 : rows}
        className={`mt-4 w-full rounded-[22px] border bg-[rgba(255,255,255,0.72)] px-4 py-3 font-mono text-sm leading-6 text-[color:var(--ink)] shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] outline-none transition ${
          state.ok
            ? 'border-[color:var(--border)] focus:border-[color:rgba(139,101,55,0.52)] focus:ring-4 focus:ring-[rgba(139,101,55,0.08)]'
            : 'border-[color:rgba(169,77,68,0.4)] focus:border-[color:rgba(169,77,68,0.55)] focus:ring-4 focus:ring-[rgba(169,77,68,0.08)]'
        }`}
        placeholder={placeholder}
      />
      <div className="mt-3 flex items-center justify-between gap-3">
        <p className={`text-xs ${state.ok ? 'text-[color:var(--success)]' : 'text-[color:var(--danger)]'}`}>
          {state.ok ? 'JSON 格式有效' : `JSON 格式错误：${state.message}`}
        </p>
        {value?.trim() ? (
          <p className="text-xs text-[color:var(--ink-muted)]">{value.length} 个字符</p>
        ) : null}
      </div>
    </div>
  );
}
