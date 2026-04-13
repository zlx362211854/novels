import { useEffect, useState } from 'react';
import { publishApi } from '../services/api';
import { useFeedback } from './ui/FeedbackProvider';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Upload, LogIn, Check, X, Loader2 } from 'lucide-react';

export default function PublishDialog({ open, onClose, chapterId, chapterTitle, publishResult }) {
  const feedback = useFeedback();
  const [platforms, setPlatforms] = useState([]);
  const [selected, setSelected] = useState({});
  const [publishing, setPublishing] = useState(false);
  const [loggingIn, setLoggingIn] = useState(null);
  const [results, setResults] = useState(null);

  // 解析已发布记录
  const prevResults = (() => {
    if (!publishResult) return {};
    try { return typeof publishResult === 'string' ? JSON.parse(publishResult) : publishResult; }
    catch { return {}; }
  })();

  const isPublished = (key) => prevResults[key]?.status === 'success';

  useEffect(() => {
    if (!open) return;
    setResults(null);
    publishApi.platforms().then(res => {
      setPlatforms(res.data);
      const sel = {};
      // 已发布的平台默认不勾选（需要用户主动选择"仍然发布"）
      res.data.forEach(p => { sel[p.key] = p.enabled && p.loggedIn && !isPublished(p.key); });
      setSelected(sel);
    }).catch(() => {
      feedback.error('获取平台列表失败');
    });
  }, [open]);

  const handleLogin = async (platformKey) => {
    setLoggingIn(platformKey);
    try {
      await publishApi.login(platformKey);
      feedback.success('Chrome 连接正常，可以发布');
    } catch (err) {
      feedback.error(err.response?.data?.error || '无法连接到 Chrome，请确认已开启 remote debugging');
    } finally {
      setLoggingIn(null);
    }
  };

  const handlePublish = async (mode = 'publish') => {
    const targets = Object.entries(selected).filter(([, v]) => v).map(([k]) => k);
    if (!targets.length) {
      feedback.error('请选择至少一个平台');
      return;
    }
    setPublishing(mode);
    setResults(null);
    try {
      const res = await publishApi.publish(chapterId, targets, mode);
      setResults(res.data.results);
      const allSuccess = Object.values(res.data.results).every(r => r.status === 'success');
      if (allSuccess) {
        feedback.success(mode === 'draft' ? '已保存为草稿' : '发布成功');
      } else {
        feedback.error('部分平台操作失败，请查看详情');
      }
    } catch (err) {
      feedback.error(err.response?.data?.error || '操作失败');
    } finally {
      setPublishing(false);
    }
  };

  const togglePlatform = (key) => {
    setSelected(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-4 w-4" />
            发布章节
          </DialogTitle>
          <DialogDescription>
            将「{chapterTitle}」发布到小说平台
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {platforms.map(p => (
            <div
              key={p.key}
              className="flex items-center justify-between rounded-lg border p-3"
            >
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={selected[p.key] || false}
                  onChange={() => togglePlatform(p.key)}
                  disabled={publishing || !p.enabled}
                  className="h-4 w-4 rounded border-input"
                />
                <div>
                  <span className="text-sm font-medium">{p.name}</span>
                  {!p.enabled && (
                    <span className="ml-2 text-xs text-muted-foreground">未启用</span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {results && results[p.key] && (
                  <ResultBadge result={results[p.key]} />
                )}

                {!results && isPublished(p.key) && (
                  <Badge variant="secondary" className="text-xs">已发布</Badge>
                )}

                {!results && !isPublished(p.key) && (
                  <Badge variant={p.loggedIn ? 'default' : 'destructive'} className="text-xs">
                    {p.loggedIn ? '已登录' : '未登录'}
                  </Badge>
                )}

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleLogin(p.key)}
                  disabled={loggingIn === p.key}
                  title={p.loggedIn ? '重新登录' : '登录'}
                >
                  {loggingIn === p.key ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <LogIn className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
            </div>
          ))}

          {platforms.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-4">
              暂无可用平台，请在系统设置中配置
            </p>
          )}

        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onClose(false)} disabled={!!publishing}>
            {results ? '关闭' : '取消'}
          </Button>
          {!results && (() => {
            const hasSelected = Object.values(selected).some(Boolean);
            const selectedKeys = Object.entries(selected).filter(([, v]) => v).map(([k]) => k);
            const hasAlreadyPublished = selectedKeys.some(k => isPublished(k));
            return (
              <>
                <Button
                  variant="outline"
                  onClick={() => handlePublish('draft')}
                  disabled={!!publishing || !hasSelected}
                >
                  {publishing === 'draft'
                    ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" />保存中...</>
                    : '存为草稿'}
                </Button>
                {!hasAlreadyPublished && (
                  <Button
                    onClick={() => handlePublish('publish')}
                    disabled={!!publishing || !hasSelected}
                  >
                    {publishing === 'publish'
                      ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" />发布中...</>
                      : '立即发布'}
                  </Button>
                )}
                {hasAlreadyPublished && (
                  <Button
                    variant="destructive"
                    onClick={() => handlePublish('publish')}
                    disabled={!!publishing || !hasSelected}
                  >
                    {publishing === 'publish'
                      ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" />发布中...</>
                      : '仍然发布'}
                  </Button>
                )}
              </>
            );
          })()}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResultBadge({ result }) {
  if (result.status === 'success') {
    return (
      <Badge variant="default" className="text-xs bg-green-600">
        <Check className="mr-1 h-3 w-3" />
        已发布
      </Badge>
    );
  }
  if (result.status === 'skipped') {
    return (
      <Badge variant="secondary" className="text-xs">
        已跳过
      </Badge>
    );
  }
  return (
    <Badge variant="destructive" className="text-xs">
      <X className="mr-1 h-3 w-3" />
      失败
    </Badge>
  );
}
