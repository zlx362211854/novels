import { Button } from '@/components/ui/button';
import { CheckCheck, SkipForward } from 'lucide-react';
import { buildUnifiedDiffRows } from '@/lib/unifiedDiff';

/**
 * LCS-based paragraph diff.
 * Returns { left: [{text, type}], right: [{text, type}] }
 * type: 'unchanged' | 'removed' | 'added'
 */
function diffParagraphs(original, revised) {
  const leftParas = original.split(/\n\n+/).filter((p) => p.trim() !== '');
  const rightParas = revised.split(/\n\n+/).filter((p) => p.trim() !== '');

  const m = leftParas.length;
  const n = rightParas.length;

  // Build LCS table
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (leftParas[i - 1] === rightParas[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to build diff
  const left = [];
  const right = [];
  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && leftParas[i - 1] === rightParas[j - 1]) {
      left.unshift({ text: leftParas[i - 1], type: 'unchanged' });
      right.unshift({ text: rightParas[j - 1], type: 'unchanged' });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      left.unshift({ text: '', type: 'spacer' });
      right.unshift({ text: rightParas[j - 1], type: 'added' });
      j--;
    } else {
      left.unshift({ text: leftParas[i - 1], type: 'removed' });
      right.unshift({ text: '', type: 'spacer' });
      i--;
    }
  }

  return { left, right };
}

const PARA_STYLES = {
  unchanged: 'px-3 py-2 mb-2 text-sm text-muted-foreground whitespace-pre-wrap',
  removed: 'bg-red-50 border-l-2 border-red-400 px-3 py-2 mb-2 text-sm whitespace-pre-wrap',
  added: 'bg-green-50 border-l-2 border-green-400 px-3 py-2 mb-2 text-sm whitespace-pre-wrap',
  spacer: 'px-3 py-2 mb-2 text-sm opacity-0 select-none pointer-events-none',
};

function ParagraphBlock({ item }) {
  return (
    <div className={PARA_STYLES[item.type]}>
      {item.text || '\u00a0'}
    </div>
  );
}

const UNIFIED_ROW_STYLES = {
  unchanged: 'border-l-4 border-transparent bg-white text-slate-700',
  removed: 'border-l-4 border-rose-500 bg-rose-50 text-rose-950',
  added: 'border-l-4 border-emerald-500 bg-emerald-50 text-emerald-950',
};

const UNIFIED_MARKER_STYLES = {
  unchanged: 'text-slate-400',
  removed: 'text-rose-600',
  added: 'text-emerald-700',
};

function UnifiedDiffRow({ row, index }) {
  return (
    <div className={`grid grid-cols-[4rem_2rem_1fr] border-b border-slate-100 font-mono text-xs leading-6 ${UNIFIED_ROW_STYLES[row.type]}`}>
      <div className="select-none border-r border-slate-200 bg-slate-50/80 px-2 text-right text-slate-400">
        {index + 1}
      </div>
      <div className={`select-none px-2 text-center font-semibold ${UNIFIED_MARKER_STYLES[row.type]}`}>
        {row.marker}
      </div>
      <pre className="whitespace-pre-wrap break-words px-3 py-2 font-[inherit]">{row.text || ' '}</pre>
    </div>
  );
}

/**
 * Props:
 * - originalContent: string
 * - revisedContent: string
 * - summary: string
 * - chapterNumber: number
 * - title: string
 * - onAccept: () => void
 * - onSkip: () => void
 * - acceptLabel?: string
 * - skipLabel?: string
 * - variant?: 'split' | 'unified'
 * - isLast: boolean
 * - currentIndex: number
 * - totalCount: number
 */
export default function ChapterDiffView({
  originalContent,
  revisedContent,
  summary,
  chapterNumber,
  title,
  onAccept,
  onSkip,
  acceptLabel,
  skipLabel,
  variant = 'split',
  isLast,
  currentIndex,
  totalCount,
}) {
  const { left, right } = diffParagraphs(originalContent || '', revisedContent || '');
  const unifiedRows = buildUnifiedDiffRows(originalContent || '', revisedContent || '');

  return (
    <div className="h-[600px] overflow-hidden flex flex-col border rounded-lg bg-card shadow-sm">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 px-4 py-3 border-b bg-muted/30 shrink-0">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">
            第{chapterNumber}章：{title || '未命名'}
          </p>
          {summary && (
            <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
              修改摘要：{summary}
            </p>
          )}
        </div>
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
          {currentIndex + 1} / {totalCount}
        </span>
      </div>

      {variant === 'unified' ? (
        <>
          <div className="grid grid-cols-[4rem_2rem_1fr] border-b bg-slate-950 px-0 py-0 text-xs font-medium text-slate-200 shrink-0">
            <div className="border-r border-slate-700 px-2 py-2 text-right text-slate-400">行</div>
            <div className="px-2 py-2 text-center text-slate-400">±</div>
            <div className="px-3 py-2">Unified diff</div>
          </div>
          <div className="flex-1 overflow-y-auto bg-white">
            {unifiedRows.map((row, index) => (
              <UnifiedDiffRow key={`${row.type}-${index}`} row={row} index={index} />
            ))}
          </div>
        </>
      ) : (
        <>
          {/* Column labels */}
          <div className="grid grid-cols-2 divide-x border-b shrink-0">
            <div className="px-4 py-2 text-xs font-medium text-muted-foreground">原文</div>
            <div className="px-4 py-2 text-xs font-medium text-muted-foreground">修订稿</div>
          </div>

          {/* Diff columns */}
          <div className="grid grid-cols-2 divide-x flex-1 min-h-0">
            <div className="overflow-y-auto p-3">
              {left.map((item, idx) => (
                <ParagraphBlock key={idx} item={item} />
              ))}
            </div>
            <div className="overflow-y-auto p-3">
              {right.map((item, idx) => (
                <ParagraphBlock key={idx} item={item} />
              ))}
            </div>
          </div>
        </>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 px-4 py-3 border-t bg-muted/20 shrink-0">
        <Button variant="outline" size="sm" onClick={onSkip}>
          <SkipForward className="mr-1.5 h-4 w-4" />
          {skipLabel || '跳过此章'}
        </Button>
        <Button size="sm" onClick={onAccept}>
          <CheckCheck className="mr-1.5 h-4 w-4" />
          {acceptLabel || (isLast ? '确认并完成' : '确认修订')}
        </Button>
      </div>
    </div>
  );
}
