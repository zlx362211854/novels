import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Sparkles, CopyPlus } from 'lucide-react';
import { novelApi } from '../services/api';
import { useFeedback } from '../components/ui/FeedbackProvider';
import { PageShell, SectionCard } from '../components/ui/PageShell';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';

const MODEL_OPTIONS = [
  { value: 'zhipu', label: '智谱 AI' },
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'minimax', label: 'MiniMax' },
];

const GRAPH_MODEL_FIELDS = [
  { key: 'architectureGeneration', label: '基础信息/架构生成' },
  { key: 'chapterBatchGeneration', label: '章架构批量生成' },
  { key: 'architectureReview', label: '章架构审阅' },
  { key: 'architectureRepair', label: '章架构修补' },
];

const emptyProfile = () => ({ provider: '', model: '', maxTokens: '' });
const defaultBootstrapProfile = () => ({
  provider: 'deepseek',
  model: 'deepseek-v4-flash',
  maxTokens: '12000',
});

function normalizeProfile(value, fallbackProvider = '') {
  if (!value) return { provider: fallbackProvider, model: '', maxTokens: '' };
  if (typeof value === 'string') return { provider: value, model: '', maxTokens: '' };
  return {
    provider: value.provider || fallbackProvider || '',
    model: value.model || '',
    maxTokens: value.maxTokens ?? '',
  };
}

function serializeProfile(profile) {
  if (!profile?.provider) return null;
  const maxTokens = Number(profile.maxTokens);
  return {
    provider: profile.provider,
    model: profile.model?.trim() || undefined,
    maxTokens: Number.isFinite(maxTokens) && maxTokens > 0 ? Math.floor(maxTokens) : undefined,
  };
}

function serializeAiConfig(aiConfig) {
  const graphModels = Object.fromEntries(
    Object.entries(aiConfig?.graphModels || {})
      .map(([key, value]) => [key, serializeProfile(value)])
      .filter(([, value]) => Boolean(value))
  );

  return {
    defaultModel: aiConfig?.defaultProfile?.provider || aiConfig?.defaultModel || undefined,
    defaultProfile: serializeProfile(aiConfig?.defaultProfile),
    graphModels,
    chapterGenerationPromptTemplate: aiConfig?.chapterGenerationPromptTemplate?.trim() || undefined,
  };
}

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
    aiConfig: {
      defaultModel: 'deepseek',
      defaultProfile: defaultBootstrapProfile(),
      graphModels: {},
      chapterGenerationPromptTemplate: '',
    },
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
        aiConfig: serializeAiConfig(form.aiConfig),
      });
      feedback.success(`已创建小说《${response.data.title}》。`);
      navigate(`/novels/${response.data.novelId}`);
    } catch (error) {
      feedback.error(error.response?.data?.error || 'AI 创建小说失败，请稍后重试。');
    } finally {
      setSubmitting(false);
    }
  };

  const promptPlaceholder = '写一部长篇古代权谋言情小说，主角成长线清晰，节奏要有持续升级感。';
  const samplePrompt = '生成一部长篇女频古代权谋逆袭小说。女主出身没落世家，表面温婉克制，实则心思缜密、极擅布局，从一桩旧案切入朝局，在后宅、宫廷与朝堂的多重斗争中一步步完成家族复兴与个人掌权。男主是外冷内稳、手握兵权的年轻王爷，与女主从互相试探到深度联手，感情线慢热但张力强。整体风格要有压迫感、翻盘感和持续升级的爽点，每一卷都要有明确目标、强冲突、阶段高潮和卷尾钩子，并兼顾人物成长、权谋博弈与情感推进。';

  return (
    <PageShell
      eyebrow="AI Bootstrap"
      title="AI 创建小说"
      description="输入一个核心提示词，系统会自动生成小说基础信息、故事圣经、三级架构，并连续执行 3 轮章架构审阅后直接保存。"
    >
      <SectionCard title="生成配置" description="首版只要求一个提示词，其余约束用于提升结果稳定性。">
        <form className="space-y-5" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="prompt">提示词</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleChange('prompt', samplePrompt)}
                >
                <CopyPlus className="mr-1.5 h-4 w-4" />
                填入示例提示词
              </Button>
            </div>
            <Textarea
              id="prompt"
              rows={8}
              value={form.prompt}
              onChange={(event) => handleChange('prompt', event.target.value)}
              placeholder={promptPlaceholder}
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

          <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
            <div>
              <p className="text-sm font-medium">小说级 AI 配置</p>
              <p className="mt-1 text-xs text-muted-foreground">
                这里的配置会优先于系统设置，并用于这次 AI 创建小说流程。
              </p>
            </div>
            <div className="space-y-2">
              <Label>小说默认模型</Label>
              <Select
                value={form.aiConfig?.defaultProfile?.provider || form.aiConfig?.defaultModel || '__default__'}
                onValueChange={(value) => handleChange('aiConfig', {
                  ...form.aiConfig,
                  defaultModel: value === '__default__' ? '' : value,
                  defaultProfile: value === '__default__'
                    ? emptyProfile()
                    : {
                        ...normalizeProfile(form.aiConfig?.defaultProfile),
                        provider: value,
                      },
                })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__default__">继承系统默认模型</SelectItem>
                  {MODEL_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="bootstrap-model-version">默认模型版本</Label>
                <Input
                  id="bootstrap-model-version"
                  value={form.aiConfig?.defaultProfile?.model || ''}
                  onChange={(event) => handleChange('aiConfig', {
                    ...form.aiConfig,
                    defaultProfile: {
                      ...normalizeProfile(form.aiConfig?.defaultProfile, form.aiConfig?.defaultModel),
                      model: event.target.value,
                    },
                  })}
                  placeholder="例如 glm-5 / deepseek-v4-pro"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bootstrap-model-max-tokens">默认 Max Tokens</Label>
                <Input
                  id="bootstrap-model-max-tokens"
                  type="number"
                  min="1"
                  value={form.aiConfig?.defaultProfile?.maxTokens ?? ''}
                  onChange={(event) => handleChange('aiConfig', {
                    ...form.aiConfig,
                    defaultProfile: {
                      ...normalizeProfile(form.aiConfig?.defaultProfile, form.aiConfig?.defaultModel),
                      maxTokens: event.target.value,
                    },
                  })}
                  placeholder="留空则使用默认值"
                />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {GRAPH_MODEL_FIELDS.map((field) => (
                <div key={field.key} className="space-y-2">
                  <Label>{field.label}</Label>
                  <div className="space-y-2 rounded-md border bg-background/70 p-3">
                    <Select
                      value={form.aiConfig?.graphModels?.[field.key]?.provider || '__default__'}
                      onValueChange={(value) => handleChange('aiConfig', {
                        ...form.aiConfig,
                        graphModels: {
                          ...form.aiConfig?.graphModels,
                          [field.key]: value === '__default__'
                            ? undefined
                            : {
                                ...normalizeProfile(form.aiConfig?.graphModels?.[field.key]),
                                provider: value,
                              },
                        },
                      })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__default__">继承小说默认模型</SelectItem>
                        {MODEL_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {form.aiConfig?.graphModels?.[field.key]?.provider ? (
                      <>
                        <Input
                          value={form.aiConfig?.graphModels?.[field.key]?.model || ''}
                          onChange={(event) => handleChange('aiConfig', {
                            ...form.aiConfig,
                            graphModels: {
                              ...form.aiConfig?.graphModels,
                              [field.key]: {
                                ...normalizeProfile(form.aiConfig?.graphModels?.[field.key]),
                                model: event.target.value,
                              },
                            },
                          })}
                          placeholder="模型版本"
                        />
                        <Input
                          type="number"
                          min="1"
                          value={form.aiConfig?.graphModels?.[field.key]?.maxTokens ?? ''}
                          onChange={(event) => handleChange('aiConfig', {
                            ...form.aiConfig,
                            graphModels: {
                              ...form.aiConfig?.graphModels,
                              [field.key]: {
                                ...normalizeProfile(form.aiConfig?.graphModels?.[field.key]),
                                maxTokens: event.target.value,
                              },
                            },
                          })}
                          placeholder="Max Tokens"
                        />
                      </>
                    ) : null}
                  </div>
                </div>
              ))}
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
