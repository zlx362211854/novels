import { useState, useEffect } from 'react';
import { configApi, publishApi } from '../services/api';
import { useFeedback } from '../components/ui/FeedbackProvider';
import { PageShell, SectionCard } from '../components/ui/PageShell';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Settings as SettingsIcon, Eye, EyeOff, Loader2, Globe, LogIn } from 'lucide-react';

function Settings() {
  const feedback = useFeedback();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState({
    aiModel: 'zhipu',
    zhipuApiKey: '',
    deepseekApiKey: '',
    minimaxApiKey: '',
    reviewStrictness: 'strict',
  });
  const [showZhipuKey, setShowZhipuKey] = useState(false);
  const [showDeepseekKey, setShowDeepseekKey] = useState(false);
  const [showMinimaxKey, setShowMinimaxKey] = useState(false);
  const [publishPlatforms, setPublishPlatforms] = useState([]);
  const [publishConfig, setPublishConfig] = useState({});
  const [agentBrowserPath, setAgentBrowserPath] = useState('agent-browser');
  const [publishSaving, setPublishSaving] = useState(false);
  const [loggingIn, setLoggingIn] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [configRes] = await Promise.all([
        configApi.getAll(),
      ]);
      setEditForm({
        aiModel: configRes.data.aiModel || 'zhipu',
        zhipuApiKey: configRes.data.zhipuApiKey || '',
        deepseekApiKey: configRes.data.deepseekApiKey || '',
        minimaxApiKey: configRes.data.minimaxApiKey || '',
        reviewStrictness: configRes.data.reviewStrictness || 'strict',
      });
      setAgentBrowserPath(configRes.data.agentBrowserPath || 'agent-browser');

      const publishPlatformConfig = configRes.data.publishPlatforms || {};
      setPublishConfig(publishPlatformConfig);

      try {
        const platformsRes = await publishApi.platforms();
        setPublishPlatforms(platformsRes.data);
      } catch { /* 发布平台加载失败不影响主流程 */ }
    } catch (error) {
      console.error('加载数据失败:', error);
      feedback.error('加载设置失败，请稍后重试。');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveConfig = async () => {
    setSaving(true);
    try {
      await Promise.all([
        configApi.update('aiModel', editForm.aiModel, '当前使用的AI模型'),
        configApi.update('zhipuApiKey', editForm.zhipuApiKey, '智谱AI API密钥'),
        configApi.update('deepseekApiKey', editForm.deepseekApiKey, 'DeepSeek API密钥'),
        configApi.update('minimaxApiKey', editForm.minimaxApiKey, 'MiniMax API密钥'),
        configApi.update('reviewStrictness', editForm.reviewStrictness, '审核严格度'),
      ]);
      feedback.success('配置保存成功！');
    } catch (error) {
      console.error('保存配置失败:', error);
      feedback.error('保存配置失败，请稍后重试。');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <PageShell
      eyebrow="Settings"
      title="系统设置"
      description="配置 AI 模型和 API 密钥"
    >
      <Tabs defaultValue="ai-config" className="space-y-6">
        <TabsList>
          <TabsTrigger value="ai-config" className="gap-1.5">
            <SettingsIcon className="h-4 w-4" />
            AI 配置
          </TabsTrigger>
          <TabsTrigger value="publish-config" className="gap-1.5">
            <Globe className="h-4 w-4" />
            发布平台
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ai-config">
          <SectionCard title="AI 模型配置" description="选择 AI 模型并配置 API 密钥">
            <div className="grid gap-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="ai-model">AI 模型</Label>
                  <Select
                    value={editForm.aiModel}
                    onValueChange={(value) => setEditForm({ ...editForm, aiModel: value })}
                  >
                    <SelectTrigger id="ai-model">
                      <SelectValue placeholder="选择 AI 模型">
                        {(value) => ({ zhipu: '智谱 AI', deepseek: 'DeepSeek' })[value] ?? null}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="zhipu">智谱 AI</SelectItem>
                      <SelectItem value="deepseek">DeepSeek</SelectItem>
                      <SelectItem value="minimax">MiniMax</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="review-strictness">审核严格度</Label>
                  <Select
                    value={editForm.reviewStrictness}
                    onValueChange={(value) => setEditForm({ ...editForm, reviewStrictness: value })}
                  >
                    <SelectTrigger id="review-strictness">
                      <SelectValue placeholder="选择审核模式">
                        {(value) => ({ strict: '严格模式', loose: '宽松模式' })[value] ?? null}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="strict">严格模式</SelectItem>
                      <SelectItem value="loose">宽松模式</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="zhipu-key">智谱 AI API Key</Label>
                <div className="relative">
                  <Input
                    id="zhipu-key"
                    type={showZhipuKey ? 'text' : 'password'}
                    value={editForm.zhipuApiKey}
                    onChange={(e) => setEditForm({ ...editForm, zhipuApiKey: e.target.value })}
                    placeholder="输入智谱 AI API 密钥"
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="absolute right-1 top-1/2 -translate-y-1/2"
                    onClick={() => setShowZhipuKey(!showZhipuKey)}
                  >
                    {showZhipuKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="deepseek-key">DeepSeek API Key</Label>
                <div className="relative">
                  <Input
                    id="deepseek-key"
                    type={showDeepseekKey ? 'text' : 'password'}
                    value={editForm.deepseekApiKey}
                    onChange={(e) => setEditForm({ ...editForm, deepseekApiKey: e.target.value })}
                    placeholder="输入 DeepSeek API 密钥"
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="absolute right-1 top-1/2 -translate-y-1/2"
                    onClick={() => setShowDeepseekKey(!showDeepseekKey)}
                  >
                    {showDeepseekKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="minimax-key">MiniMax API Key</Label>
                <div className="relative">
                  <Input
                    id="minimax-key"
                    type={showMinimaxKey ? 'text' : 'password'}
                    value={editForm.minimaxApiKey}
                    onChange={(e) => setEditForm({ ...editForm, minimaxApiKey: e.target.value })}
                    placeholder="输入 MiniMax API 密钥"
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="absolute right-1 top-1/2 -translate-y-1/2"
                    onClick={() => setShowMinimaxKey(!showMinimaxKey)}
                  >
                    {showMinimaxKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <Button onClick={handleSaveConfig} disabled={saving} className="w-full sm:w-auto">
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                保存配置
              </Button>
            </div>
          </SectionCard>
        </TabsContent>

        <TabsContent value="publish-config">
          <SectionCard title="发布平台配置" description="配置 agent-browser 路径和平台启用状态；作品 ID 在具体小说里配置">
            <div className="grid gap-6">
              <div className="space-y-2">
                <Label htmlFor="agent-browser-path">agent-browser 路径</Label>
                <Input
                  id="agent-browser-path"
                  value={agentBrowserPath}
                  onChange={(e) => setAgentBrowserPath(e.target.value)}
                  placeholder="agent-browser"
                />
                <p className="text-xs text-muted-foreground">
                  如果已全局安装可保持默认值，否则填写完整路径
                </p>
              </div>

              <div className="space-y-4">
                {publishPlatforms.map(p => {
                  const config = publishConfig[p.key] || {};
                  return (
                    <Card key={p.key}>
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-base">{p.name}</CardTitle>
                          <div className="flex items-center gap-2">
                            <Badge variant={p.loggedIn ? 'default' : 'secondary'} className="text-xs">
                              {p.loggedIn ? '已登录' : '未登录'}
                            </Badge>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={async () => {
                                setLoggingIn(p.key);
                                try {
                                  await publishApi.login(p.key);
                                  const res = await publishApi.platforms();
                                  setPublishPlatforms(res.data);
                                  feedback.success(`${p.name} 浏览器已关闭，登录状态已更新`);
                                } catch (err) {
                                  feedback.error(err.response?.data?.error || '登录失败');
                                } finally {
                                  setLoggingIn(null);
                                }
                              }}
                              disabled={loggingIn === p.key}
                            >
                              {loggingIn === p.key ? (
                                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <LogIn className="mr-1.5 h-3.5 w-3.5" />
                              )}
                              登录
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="flex items-center gap-3">
                          <Label className="w-16 shrink-0">启用</Label>
                          <input
                            type="checkbox"
                            checked={config.enabled || false}
                            onChange={(e) => setPublishConfig(prev => ({
                              ...prev,
                              [p.key]: { ...prev[p.key], enabled: e.target.checked }
                            }))}
                            className="h-4 w-4 rounded border-input"
                          />
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}

                {publishPlatforms.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    加载平台列表失败或无可用平台
                  </p>
                )}
              </div>

              <Button
                onClick={async () => {
                  setPublishSaving(true);
                  try {
                    await configApi.update('agentBrowserPath', agentBrowserPath, 'agent-browser CLI 路径');
                    await configApi.update('publishPlatforms', publishConfig, '发布平台配置');
                    feedback.success('发布配置已保存');
                  } catch {
                    feedback.error('保存失败');
                  } finally {
                    setPublishSaving(false);
                  }
                }}
                disabled={publishSaving}
              >
                {publishSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                保存发布配置
              </Button>
            </div>
          </SectionCard>
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}

export default Settings;
