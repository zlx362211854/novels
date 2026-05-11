import { useEffect, useMemo, useState } from 'react';
import { Loader2, Play, Save, Trash2, Clock, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { recurringTaskApi } from '../services/api';
import { useFeedback } from './ui/FeedbackProvider';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { SectionCard } from './ui/PageShell';

const PRESETS = [
  { label: '每天 8:00', value: '0 8 * * *' },
  { label: '每天 9:30', value: '30 9 * * *' },
  { label: '每天 0:00', value: '0 0 * * *' },
  { label: '每 6 小时', value: '0 */6 * * *' },
  { label: '每小时', value: '0 * * * *' },
];

const STATUS_LABEL = {
  running: { text: '运行中', tone: 'default' },
  success: { text: '上次成功', tone: 'secondary' },
  partial: { text: '上次部分成功', tone: 'secondary' },
  failed: { text: '上次失败', tone: 'destructive' },
  idle: { text: '上次无可生成章节', tone: 'outline' },
};

function formatDateTime(value) {
  if (!value) return '—';
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleString();
  } catch {
    return value;
  }
}

function RecurringTaskCard({ novelId }) {
  const feedback = useFeedback();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [task, setTask] = useState(null);
  const [form, setForm] = useState({ cronExpression: '0 8 * * *', enabled: true, chaptersPerRun: 1 });

  const isRunning = task?.last_run_status === 'running';

  const loadTask = async () => {
    setLoading(true);
    try {
      const res = await recurringTaskApi.get(novelId);
      const data = res.data;
      setTask(data || null);
      if (data) {
        setForm({
          cronExpression: data.cron_expression || '0 8 * * *',
          enabled: !!data.enabled,
          chaptersPerRun: data.chapters_per_run || 1,
        });
      }
    } catch (error) {
      console.error('加载周期任务失败:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (novelId) loadTask();
  }, [novelId]);

  const handleSave = async () => {
    if (!form.cronExpression?.trim()) {
      feedback.warning('cron 表达式不能为空。');
      return;
    }
    if (isRunning) {
      feedback.warning('当前周期任务正在运行，请等待运行结束再修改。');
      return;
    }
    setSaving(true);
    try {
      const res = await recurringTaskApi.upsert(novelId, {
        cronExpression: form.cronExpression.trim(),
        enabled: form.enabled,
        chaptersPerRun: Number(form.chaptersPerRun) || 1,
      });
      setTask(res.data);
      feedback.success('周期任务已保存。');
    } catch (error) {
      console.error('保存周期任务失败:', error);
      feedback.error(error.response?.data?.error || '保存失败，请检查 cron 表达式。');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (isRunning) {
      feedback.warning('当前周期任务正在运行，请等待运行结束再删除。');
      return;
    }
    const confirmed = await feedback.confirm({
      title: '删除周期任务？',
      message: '删除后该小说将不再自动生成章节，此操作不可撤销。',
      confirmText: '确认删除',
      cancelText: '取消',
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      await recurringTaskApi.remove(novelId);
      setTask(null);
      feedback.success('周期任务已删除。');
    } catch (error) {
      console.error('删除周期任务失败:', error);
      feedback.error(error.response?.data?.error || '删除失败。');
    }
  };

  const handleRunNow = async () => {
    if (isRunning) {
      feedback.warning('周期任务已经在运行中。');
      return;
    }
    setRunning(true);
    try {
      const res = await recurringTaskApi.runNow(novelId);
      const summary = res.data?.summary || {};
      const generated = summary.generated?.length || 0;
      const failed = summary.failed?.length || 0;
      if (summary.attempted === 0) {
        feedback.info('当前没有需要生成的章节。');
      } else if (failed === 0) {
        feedback.success(`手动触发完成：成功生成 ${generated} 章。`);
      } else {
        feedback.warning(`手动触发完成：成功 ${generated} 章，失败 ${failed} 章。`);
      }
      await loadTask();
    } catch (error) {
      console.error('手动触发失败:', error);
      feedback.error(error.response?.data?.error || '手动触发失败。');
    } finally {
      setRunning(false);
    }
  };

  const lastRunBadge = useMemo(() => {
    if (!task?.last_run_status) return null;
    return STATUS_LABEL[task.last_run_status] || { text: task.last_run_status, tone: 'outline' };
  }, [task]);

  return (
    <SectionCard
      title="周期定时任务"
      description="到点自动找未生成的章节并跑一遍「生成 → 审阅 → 修复」完整流程；每本小说仅一个，运行时不可修改。"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRunNow}
            disabled={running || isRunning || !task}
            title={!task ? '请先保存周期任务' : ''}
          >
            {running ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Play className="mr-1.5 h-4 w-4" />}
            立即运行
          </Button>
          {task && (
            <Button variant="ghost" size="sm" onClick={handleDelete} disabled={isRunning}>
              <Trash2 className="mr-1.5 h-4 w-4" />
              删除
            </Button>
          )}
          <Button size="sm" onClick={handleSave} disabled={saving || isRunning}>
            {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
            {task ? '保存' : '创建'}
          </Button>
        </div>
      }
    >
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> 加载中…
        </div>
      ) : (
        <div className="space-y-4">
          {isRunning && (
            <div className="flex items-start gap-2 rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>周期任务正在运行，运行期间无法修改或删除。</span>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">cron 表达式（5 段：分 时 日 月 周）</Label>
              <Input
                value={form.cronExpression}
                onChange={(e) => setForm((s) => ({ ...s, cronExpression: e.target.value }))}
                placeholder="0 8 * * *"
                disabled={isRunning}
              />
              <div className="flex flex-wrap gap-1.5 pt-1">
                {PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    className="rounded-full border px-2 py-0.5 text-xs text-slate-600 hover:border-primary hover:text-primary disabled:opacity-50"
                    onClick={() => setForm((s) => ({ ...s, cronExpression: preset.value }))}
                    disabled={isRunning}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">每次生成章节数</Label>
              <Input
                type="number"
                min={1}
                max={50}
                value={form.chaptersPerRun}
                onChange={(e) => setForm((s) => ({ ...s, chaptersPerRun: e.target.value }))}
                disabled={isRunning}
              />
              <p className="text-xs text-muted-foreground">
                每次触发会按章架构顺序找未生成或内容为空的章节，最多 50。
              </p>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setForm((s) => ({ ...s, enabled: e.target.checked }))}
              disabled={isRunning}
            />
            <span>启用周期任务（关闭后保留配置但不再自动触发）</span>
          </label>

          {task && (
            <div className="rounded-lg border bg-muted/30 p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={form.enabled ? 'default' : 'outline'}>
                  {form.enabled ? '已启用' : '已禁用'}
                </Badge>
                {lastRunBadge && <Badge variant={lastRunBadge.tone}>{lastRunBadge.text}</Badge>}
                <span className="text-muted-foreground">
                  <Clock className="mr-1 inline h-3.5 w-3.5" />
                  下次运行：{formatDateTime(task.next_run_at)}
                </span>
                <span className="text-muted-foreground">
                  上次运行：{formatDateTime(task.last_run_at)}
                </span>
              </div>
              {task.last_run_error && (
                <p className="mt-2 text-xs text-destructive">错误：{task.last_run_error}</p>
              )}
              {task.last_run_result && (
                <div className="mt-2 text-xs text-muted-foreground">
                  <CheckCircle2 className="mr-1 inline h-3.5 w-3.5 text-emerald-500" />
                  上次：尝试 {task.last_run_result.attempted ?? 0} 章，
                  成功 {task.last_run_result.generated?.length ?? 0} 章，
                  失败 {task.last_run_result.failed?.length ?? 0} 章
                  {Array.isArray(task.last_run_result.failed) && task.last_run_result.failed.length > 0 && (
                    <ul className="mt-1 ml-4 list-disc space-y-0.5">
                      {task.last_run_result.failed.slice(0, 3).map((f, i) => (
                        <li key={i}>章架构 #{f.chapterArchId}：{f.reason}</li>
                      ))}
                      {task.last_run_result.failed.length > 3 && (
                        <li>等共 {task.last_run_result.failed.length} 条…</li>
                      )}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </SectionCard>
  );
}

export default RecurringTaskCard;
