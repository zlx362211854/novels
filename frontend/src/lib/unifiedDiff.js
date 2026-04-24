function splitParagraphs(content) {
  return String(content || '')
    .split(/\n\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function buildUnifiedDiffRows(original, revised) {
  const left = splitParagraphs(original);
  const right = splitParagraphs(revised);
  const m = left.length;
  const n = right.length;

  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      dp[i][j] = left[i - 1] === right[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  const rows = [];
  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && left[i - 1] === right[j - 1]) {
      rows.unshift({ type: 'unchanged', marker: ' ', text: left[i - 1] });
      i -= 1;
      j -= 1;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      rows.unshift({ type: 'added', marker: '+', text: right[j - 1] });
      j -= 1;
    } else {
      rows.unshift({ type: 'removed', marker: '-', text: left[i - 1] });
      i -= 1;
    }
  }

  return rows;
}
