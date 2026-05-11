import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Sparkles } from 'lucide-react';
import { novelApi } from '../services/api';
import { useFeedback } from '../components/ui/FeedbackProvider';
import { PageShell, SectionCard } from '../components/ui/PageShell';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';

function NovelBootstrap() {
  const navigate = useNavigate();
  const feedback = useFeedback();
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    prompt: '',
    genre: '',
    volumeCount: '4',
    chaptersPerVolume: '12',
    tone: '',
  });

  const handleChange = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form.prompt.trim()) {
      feedback.warning('请先输入小说提示词。');
      return;
    }

    setSubmitting(true);
    try {
      const response = await novelApi.bootstrap({
        prompt: form.prompt.trim(),
        constraints: {
          genre: form.genre.trim() || undefined,
          volumeCount: Number(form.volumeCount) || undefined,
          chaptersPerVolume: Number(form.chaptersPerVolume) || undefined,
          tone: form.tone.trim() || undefined,
        },
      });
      feedback.success(`已创建小说《${response.data.title}》。`);
      navigate(`/novels/${response.data.novelId}`);
    } catch (error) {
      feedback.error(error.response?.data?.error || 'AI 创建小说失败，请稍后重试。');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageShell
      eyebrow="AI Bootstrap"
      title="AI 创建小说"
      description="输入一个核心提示词，系统会自动生成小说基础信息、故事圣经、三级架构，并连续执行 3 轮章架构审阅后直接保存。"
    >
      <SectionCard title="生成配置" description="首版只要求一个提示词，其余约束用于提升结果稳定性。">
        <form className="space-y-5" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="prompt">提示词</Label>
            <Textarea
              id="prompt"
              rows={8}
              value={form.prompt}
              onChange={(event) => handleChange('prompt', event.target.value)}
              placeholder="例如：生成一部女频古代权谋逆袭长篇小说，女主从没落世家起步，感情线慢热，强调朝堂斗争与家族复兴。"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="genre">题材</Label>
              <Input
                id="genre"
                value={form.genre}
                onChange={(event) => handleChange('genre', event.target.value)}
                placeholder="古代言情 / 都市异能 / 仙侠等"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tone">风格与情绪</Label>
              <Input
                id="tone"
                value={form.tone}
                onChange={(event) => handleChange('tone', event.target.value)}
                placeholder="克制、压迫感、成长线强"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="volumeCount">卷数</Label>
              <Input
                id="volumeCount"
                type="number"
                min="1"
                value={form.volumeCount}
                onChange={(event) => handleChange('volumeCount', event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="chaptersPerVolume">每卷章数</Label>
              <Input
                id="chaptersPerVolume"
                type="number"
                min="1"
                value={form.chaptersPerVolume}
                onChange={(event) => handleChange('chaptersPerVolume', event.target.value)}
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={submitting}>
              {submitting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1.5 h-4 w-4" />}
              一键生成并保存
            </Button>
          </div>
        </form>
      </SectionCard>
    </PageShell>
  );
}

export default NovelBootstrap;
