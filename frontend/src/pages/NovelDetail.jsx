import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { architectureApi, chapterApi, exportApi, novelApi } from '../services/api';
import { useFeedback } from '../components/ui/FeedbackProvider';
import { PageShell, SectionCard, StatGrid } from '../components/ui/PageShell';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import { Progress } from '../components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import {
  ArrowLeft,
  Pencil,
  Download,
  FolderOpen,
  Loader2,
  BookOpen,
  Layers,
  FileText,
  CheckCircle,
} from 'lucide-react';

function NovelDetail() {
  const { id } = useParams();
  const feedback = useFeedback();
  const [novel, setNovel] = useState(null);
  const [architectures, setArchitectures] = useState([]);
  const [chapters, setChapters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [editForm, setEditForm] = useState({ title: '', description: '', genre: '' });

  useEffect(() => {
    loadData();
  }, [id]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [novelRes, archRes, chapterRes] = await Promise.all([
        novelApi.getById(id),
        architectureApi.getByNovelId(id),
        chapterApi.getByNovelId(id),
      ]);
      setNovel(novelRes.data);
      setArchitectures(archRes.data);
      setChapters(chapterRes.data);
      setEditForm({
        title: novelRes.data.title,
        description: novelRes.data.description || '',
        genre: novelRes.data.genre || '',
      });
    } catch (error) {
      console.error('加载数据失败:', error);
      feedback.error('小说工作台加载失败，请稍后重试。');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      await novelApi.update(id, editForm);
      setNovel((current) => ({ ...current, ...editForm }));
      setEditing(false);
      feedback.success('小说信息已更新。');
    } catch (error) {
      console.error('更新失败:', error);
      feedback.error(error.response?.data?.error || '保存失败，请稍后再试。');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setEditing(false);
    setEditForm({
      title: novel?.title || '',
      description: novel?.description || '',
      genre: novel?.genre || '',
    });
  };

  const handleExport = async (scope) => {
    setExporting(true);
    try {
      const res = await exportApi.exportNovel(id, scope);
      const blob = new Blob([res.data], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${novel.title}.md`;
      a.click();
      URL.revokeObjectURL(url);
      feedback.success('已导出 Markdown 文件。');
    } catch (error) {
      console.error('导出失败:', error);
      feedback.error('导出失败，请稍后再试。');
    } finally {
      setExporting(false);
    }
  };

  const summary = useMemo(() => {
    const full = architectures.filter((item) => item.level === 'full').length;
    const volume = architectures.filter((item) => item.level === 'volume').length;
    const chapterArch = architectures.filter((item) => item.level === 'chapter').length;
    const generated = chapters.filter((item) => item.status === 'generated').length;
    const draft = chapters.filter((item) => item.status === 'draft').length;
    const totalChapters = chapterArch || chapters.length;

    return {
      full,
      volume,
      chapterArch,
      generated,
      draft,
      totalChapters,
      progress: totalChapters ? Math.round((generated / totalChapters) * 100) : 0,
    };
  }, [architectures, chapters]);

  if (loading) {
    return (
      <PageShell eyebrow="Novel Workspace" title="加载中..." description="">
        <div className="flex min-h-[30vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </PageShell>
    );
  }

  if (!novel) {
    return (
      <PageShell eyebrow="Novel Workspace" title="小说不存在" description="">
        <div className="flex min-h-[30vh] items-center justify-center">
          <p className="text-muted-foreground">找不到这部小说</p>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell
      eyebrow="Novel Workspace"
      title={novel.title}
      description={novel.description || '先搭骨架，再生成章节，再统一回看节奏和完整度。'}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/" className="flex items-center justify-center">
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              返回
            </Link>
          </Button>
          <div className="h-4 w-px bg-border" />
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            <Pencil className="mr-1.5 h-4 w-4" />
            编辑
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleExport('full')} disabled={exporting}>
            {exporting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Download className="mr-1.5 h-4 w-4" />}
            导出
          </Button>
          <Button size="sm" asChild>
            <Link to={`/novels/${id}/architecture`} className="flex items-center justify-center">
              <FolderOpen className="mr-1.5 h-4 w-4" />
              架构工作台
            </Link>
          </Button>
        </div>
      }
    >
      {/* Progress Section */}
      <SectionCard tone="accent">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">当前进度</p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-4xl font-bold">{summary.progress}%</span>
              <span className="text-sm text-muted-foreground">
                已完成 {summary.generated} / {summary.totalChapters} 章
              </span>
            </div>
          </div>
          <div className="w-full sm:w-64">
            <Progress value={summary.progress} className="h-2" />
          </div>
        </div>
      </SectionCard>

      <StatGrid
        items={[
          { label: '全本架构', value: summary.full, caption: summary.full ? '总纲已建立' : '建议先补全总纲' },
          { label: '卷架构', value: summary.volume, caption: '管理篇章节奏' },
          { label: '章架构', value: summary.chapterArch, caption: '用于批量生产' },
          { label: '已生成章节', value: summary.generated, caption: `${summary.draft} 章草稿` },
        ]}
      />

      <SectionCard
        title="继续创作"
        description="小说详情页只做轻量概览，真正的结构调整在架构工作台完成。"
        actions={
          <>
            <Button asChild variant="secondary">
              <Link to={`/novels/${id}/chapters`}>进入章节列表</Link>
            </Button>
            <Button asChild>
              <Link to={`/novels/${id}/architecture`}>进入架构工作台</Link>
            </Button>
          </>
        }
      >
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Recommended Path */}
          <div className="rounded-lg border bg-muted/30 p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">推荐路径</p>
            <div className="mt-3 space-y-2 text-sm text-muted-foreground">
              <p>
                {summary.full
                  ? '总纲已经有了，下一步建议进入架构工作台，检查卷与章的承接，再决定是否生成正文。'
                  : '当前还没有全本架构，建议先进入架构工作台把总纲搭起来。'}
              </p>
              <p>所有高频动作都在架构工作台：补结构、拆章、单章试产、批量出稿。</p>
            </div>
          </div>

          {/* Project Info */}
          <div className="rounded-lg border p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">项目信息</p>
            <div className="mt-3 space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <Badge variant={novel.genre ? 'secondary' : 'outline'}>
                  {novel.genre || '未设置类型'}
                </Badge>
              </div>
              <div>
                <p className="text-muted-foreground">简介</p>
                <p className="mt-1">{novel.description || '还没有填写简介。'}</p>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <CheckCircle className="h-4 w-4 text-emerald-500" />
                <span>
                  {summary.totalChapters
                    ? `已完成 ${summary.generated} / ${summary.totalChapters} 章正文`
                    : '还没有章节，建议先从架构工作台开始'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </SectionCard>

      {/* Edit Dialog */}
      <Dialog open={editing} onOpenChange={(open) => !open && handleCancelEdit()}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>编辑小说信息</DialogTitle>
            <DialogDescription>基础信息会同步影响后续架构与导出内容。</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUpdate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-title">标题</Label>
              <Input
                id="edit-title"
                value={editForm.title}
                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-desc">简介</Label>
              <Textarea
                id="edit-desc"
                value={editForm.description}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                rows={4}
                placeholder="用几句话概括这部小说正在写什么。"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-genre">类型</Label>
              <Input
                id="edit-genre"
                value={editForm.genre}
                onChange={(e) => setEditForm({ ...editForm, genre: e.target.value })}
                placeholder="玄幻 / 科幻 / 都市..."
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleCancelEdit}>
                取消
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                保存修改
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

export default NovelDetail;
