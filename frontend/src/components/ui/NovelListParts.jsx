import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Trash2, ArrowRight, Clock, Tag } from 'lucide-react';

export function NovelProjectCard({ novel, updatedLabel, onDelete }) {
  return (
    <Card className="group transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span>{updatedLabel}</span>
            </div>
            <CardTitle className="mt-2 text-lg line-clamp-1">{novel.title}</CardTitle>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onDelete(novel)}
            className="text-muted-foreground hover:text-destructive shrink-0"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
        <div className="mt-2">
          {novel.genre ? (
            <Badge variant="secondary" className="gap-1">
              <Tag className="h-3 w-3" />
              {novel.genre}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">
              未设置题材
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex-1 pb-2">
        <CardDescription className="line-clamp-3 min-h-[3.5em]">
          {novel.description || '还没有简介。补充简介会帮助后续 AI 更快进入写作上下文。'}
        </CardDescription>
      </CardContent>
      <CardFooter className="pt-2 border-t">
        <Button asChild className="w-full group/btn">
          <Link to={`/novels/${novel.id}`} className="flex items-center justify-center">
            进入工作台
            <ArrowRight className="ml-1.5 h-4 w-4 transition-transform group-hover/btn:translate-x-0.5" />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}

export function CreateNovelModal({ creating, newNovel, onCancel, onChange, onSubmit }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <Card className="w-full max-w-xl shadow-xl">
        <CardHeader>
          <CardTitle>创建新项目</CardTitle>
          <CardDescription>
            给项目一个标题和简介，后续可以继续补全世界观和章节结构。
          </CardDescription>
        </CardHeader>
        <form onSubmit={onSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="title" className="text-sm font-medium">
                标题
              </label>
              <input
                id="title"
                type="text"
                value={newNovel.title}
                onChange={(event) => onChange({ ...newNovel, title: event.target.value })}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                placeholder="输入小说标题"
                required
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="description" className="text-sm font-medium">
                简介
              </label>
              <textarea
                id="description"
                value={newNovel.description}
                onChange={(event) => onChange({ ...newNovel, description: event.target.value })}
                rows={4}
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                placeholder="一句话说明这部小说在讲什么"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="genre" className="text-sm font-medium">
                题材
              </label>
              <input
                id="genre"
                type="text"
                value={newNovel.genre}
                onChange={(event) => onChange({ ...newNovel, genre: event.target.value })}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                placeholder="玄幻 / 科幻 / 悬疑..."
              />
            </div>
          </CardContent>
          <CardFooter className="flex justify-end gap-2 border-t pt-4">
            <Button type="button" variant="outline" onClick={onCancel}>
              取消
            </Button>
            <Button type="submit" disabled={creating}>
              {creating ? '创建中...' : '创建项目'}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
