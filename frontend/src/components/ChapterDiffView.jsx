import { Button } from '@/components/ui/button';
import { CheckCheck, SkipForward } from 'lucide-react';

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

/**
 * Props:
 * - originalContent: string
 * - revisedContent: string
 * - summary: string
 * - chapterNumber: number
 * - title: string
 * - onAccept: () => void
 * - onSkip: () => void
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
  isLast,
  currentIndex,
  totalCount,
}) {
  const { left, right } = diffParagraphs(originalContent || '', revisedContent || '');

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

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 px-4 py-3 border-t bg-muted/20 shrink-0">
        <Button variant="outline" size="sm" onClick={onSkip}>
          <SkipForward className="mr-1.5 h-4 w-4" />
          跳过此章
        </Button>
        <Button size="sm" onClick={onAccept}>
          <CheckCheck className="mr-1.5 h-4 w-4" />
          {isLast ? '确认并完成' : '确认修订'}
        </Button>
      </div>
    </div>
  );
}
