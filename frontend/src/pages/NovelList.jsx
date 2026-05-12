import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { novelApi } from '../services/api';
import { useFeedback } from '../components/ui/FeedbackProvider';
import { PageShell, SectionCard, StatGrid } from '../components/ui/PageShell';
import { CreateNovelModal, NovelProjectCard } from '../components/ui/NovelListParts';
import { Button } from '../components/ui/button';
import { Skeleton } from '../components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import { Plus, BookOpen, FolderOpen, Calendar } from 'lucide-react';

const dateFormatter = new Intl.DateTimeFormat('zh-CN', {
  month: 'short',
  day: 'numeric',
});

const getUpdatedTimestamp = (value) => {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
};

function NovelList() {
  const navigate = useNavigate();
  const feedback = useFeedback();
  const [novels, setNovels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [newNovel, setNewNovel] = useState({ title: '', description: '', genre: '' });

  useEffect(() => {
    loadNovels();
  }, []);

  const loadNovels = async () => {
    setLoading(true);
    try {
      const res = await novelApi.getAll();
      setNovels(res.data);
    } catch (error) {
      console.error('加载小说列表失败:', error);
      feedback.error('小说列表加载失败，请稍后重试。');
    } finally {
      setLoading(false);
    }
  };

  const sortedNovels = useMemo(() => {
    return [...novels].sort(
      (left, right) =>
        getUpdatedTimestamp(right.updated_at) - getUpdatedTimestamp(left.updated_at) || left.title.localeCompare(right.title)
    );
  }, [novels]);

  const stats = useMemo(() => {
    const genres = new Set(sortedNovels.map((novel) => novel.genre).filter(Boolean));
    const latestNovel = sortedNovels[0];
    return [
      { label: '项目总数', value: sortedNovels.length, caption: sortedNovels.length ? '所有进行中的项目' : '还没有创建项目' },
      { label: '已分类题材', value: genres.size, caption: '当前已使用的题材数量' },
      {
        label: '最近更新',
        value: latestNovel?.updated_at ? dateFormatter.format(new Date(latestNovel.updated_at)) : '-',
        caption: '按最近更新时间浏览更省心',
      },
    ];
  }, [sortedNovels]);

  const formatUpdatedAt = (value) => (value ? dateFormatter.format(new Date(value)) : '待更新');

  const handleCreate = async (event) => {
    event.preventDefault();
    if (!newNovel.title.trim()) {
      feedback.warning('请先填写小说标题。');
      return;
    }

    setCreating(true);
    try {
      await novelApi.create(newNovel);
      setNewNovel({ title: '', description: '', genre: '' });
      setShowCreate(false);
      feedback.success('新小说已创建。');
      loadNovels();
    } catch (error) {
      console.error('创建小说失败:', error);
      feedback.error(error.response?.data?.error || '创建失败，请稍后再试。');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (novel) => {
    const confirmed = await feedback.confirm({
      title: `删除「${novel.title}」？`,
      message: '删除后，这部小说的架构、章节和版本历史都会一并移除。',
      confirmText: '确认删除',
      cancelText: '保留项目',
      variant: 'danger',
    });
    if (!confirmed) return;

    try {
      await novelApi.delete(novel.id);
      feedback.success('小说项目已删除。');
      loadNovels();
    } catch (error) {
      console.error('删除小说失败:', error);
      feedback.error(error.response?.data?.error || '删除失败，请稍后再试。');
    }
  };

  const handleImport = async () => {
    if (!importFile) {
      feedback.warning('请先选择导出的 JSON 文件。');
      return;
    }

    setImporting(true);
    try {
      const text = await importFile.text();
      const bundle = JSON.parse(text);
      const res = await novelApi.importJson(bundle);
      feedback.success('小说已导入。');
      setImportFile(null);
      setShowImport(false);
      await loadNovels();
      navigate(`/novels/${res.data.novelId}`);
    } catch (error) {
      console.error('导入小说失败:', error);
      if (error instanceof SyntaxError) {
        feedback.error('选择的文件不是合法 JSON。');
      } else {
        feedback.error(error.response?.data?.error || '导入失败，请稍后再试。');
      }
    } finally {
      setImporting(false);
    }
  };

  if (loading) {
    return (
      <PageShell eyebrow="Project Index" title="我的项目" description="加载中...">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-3 rounded-lg border p-4">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-16 w-full" />
            </div>
          ))}
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell
      eyebrow="Project Index"
      title="我的项目"
      description="把创作项目当成一页页可翻阅的工作文档。进入项目后，可以继续拆架构、写章节、回看版本。"
      actions={
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowImport(true)}>
            导入小说
          </Button>
          <Button variant="secondary" onClick={() => navigate('/novels/bootstrap')}>
            AI 创建小说
          </Button>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            创建新项目
          </Button>
        </div>
      }
    >
      <StatGrid items={stats} />

      <SectionCard
        title="项目列表"
        description="最近更新的项目排在前面，方便回到正在推进的作品。"
      >
        {sortedNovels.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="rounded-full bg-muted p-4">
              <BookOpen className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="mt-4 text-lg font-semibold">还没有创建任何小说</h3>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              先建立一个项目，再逐步补上简介、题材和章节结构。索引会把每个作品都整理成一张可继续推进的手稿卡片。
            </p>
            <Button onClick={() => setShowCreate(true)} className="mt-6">
              <Plus className="mr-1.5 h-4 w-4" />
              创建第一个项目
            </Button>
            <Button variant="secondary" onClick={() => navigate('/novels/bootstrap')} className="mt-3">
              AI 创建第一部小说
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {sortedNovels.map((novel) => (
              <NovelProjectCard
                key={novel.id}
                novel={novel}
                updatedLabel={formatUpdatedAt(novel.updated_at)}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </SectionCard>

      {showCreate && (
        <CreateNovelModal
          creating={creating}
          newNovel={newNovel}
          onCancel={() => setShowCreate(false)}
          onChange={setNewNovel}
          onSubmit={handleCreate}
        />
      )}

      <Dialog
        open={showImport}
        onOpenChange={(open) => {
          setShowImport(open);
          if (!open) {
            setImportFile(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>导入小说</DialogTitle>
            <DialogDescription>
              选择之前导出的 JSON 文件，系统会创建一部新的小说副本，不会覆盖现有项目。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <input
              type="file"
              accept="application/json,.json"
              onChange={(event) => setImportFile(event.target.files?.[0] || null)}
            />
            {importFile ? (
              <p className="text-sm text-muted-foreground">已选择：{importFile.name}</p>
            ) : (
              <p className="text-sm text-muted-foreground">请选择一份小说导出 JSON 文件。</p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowImport(false);
                setImportFile(null);
              }}
              disabled={importing}
            >
              取消
            </Button>
            <Button onClick={handleImport} disabled={importing}>
              {importing ? '导入中...' : '开始导入'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

export default NovelList;
