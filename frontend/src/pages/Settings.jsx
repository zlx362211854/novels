import { useState, useEffect } from 'react';
import { configApi, templateApi } from '../services/api';
import { useFeedback } from '../components/ui/FeedbackProvider';
import { PageShell, SectionCard } from '../components/ui/PageShell';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Settings as SettingsIcon, FileText, Plus, Pencil, Trash2, Star, Eye, EyeOff, Loader2 } from 'lucide-react';

function Settings() {
  const feedback = useFeedback();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState({
    aiModel: 'zhipu',
    zhipuApiKey: '',
    deepseekApiKey: '',
    reviewStrictness: 'strict',
  });
  const [showZhipuKey, setShowZhipuKey] = useState(false);
  const [showDeepseekKey, setShowDeepseekKey] = useState(false);
  const [showTemplateEditor, setShowTemplateEditor] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [templateForm, setTemplateForm] = useState({ name: '', template: '', description: '' });
  const [templateSaving, setTemplateSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [configRes, templateRes] = await Promise.all([
        configApi.getAll(),
        templateApi.getAll(),
      ]);
      setTemplates(templateRes.data);
      setEditForm({
        aiModel: configRes.data.aiModel || 'zhipu',
        zhipuApiKey: configRes.data.zhipuApiKey || '',
        deepseekApiKey: configRes.data.deepseekApiKey || '',
        reviewStrictness: configRes.data.reviewStrictness || 'strict',
      });
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

  const handleCreateTemplate = async (e) => {
    e.preventDefault();
    setTemplateSaving(true);
    try {
      await templateApi.create(templateForm);
      setTemplateForm({ name: '', template: '', description: '' });
      setShowTemplateEditor(false);
      loadData();
      feedback.success('模板创建成功！');
    } catch (error) {
      console.error('创建模板失败:', error);
      feedback.error('创建模板失败，请稍后重试。');
    } finally {
      setTemplateSaving(false);
    }
  };

  const handleUpdateTemplate = async (e) => {
    e.preventDefault();
    setTemplateSaving(true);
    try {
      await templateApi.update(editingTemplate.id, templateForm);
      setEditingTemplate(null);
      setTemplateForm({ name: '', template: '', description: '' });
      loadData();
      feedback.success('模板更新成功！');
    } catch (error) {
      console.error('更新模板失败:', error);
      feedback.error('更新模板失败，请稍后重试。');
    } finally {
      setTemplateSaving(false);
    }
  };

  const handleDeleteTemplate = async (id) => {
    const confirmed = await feedback.confirm({
      title: '删除模板',
      message: '确定要删除这个模板吗？此操作无法撤销。',
      confirmText: '删除',
      cancelText: '取消',
      variant: 'danger',
    });
    if (!confirmed) return;

    try {
      await templateApi.delete(id);
      loadData();
      feedback.success('模板已删除。');
    } catch (error) {
      console.error('删除模板失败:', error);
      feedback.error('删除模板失败，请稍后重试。');
    }
  };

  const handleSetDefaultTemplate = async (id) => {
    try {
      await templateApi.setDefault(id);
      loadData();
      feedback.success('已设置为默认模板。');
    } catch (error) {
      console.error('设置默认模板失败:', error);
      feedback.error('设置默认模板失败，请稍后重试。');
    }
  };

  const startEditTemplate = (template) => {
    setEditingTemplate(template);
    setTemplateForm({
      name: template.name,
      template: template.template,
      description: template.description || '',
    });
    setShowTemplateEditor(false);
  };

  const openCreateTemplate = () => {
    setEditingTemplate(null);
    setTemplateForm({ name: '', template: '', description: '' });
    setShowTemplateEditor(true);
  };

  const closeTemplateEditor = () => {
    setShowTemplateEditor(false);
    setEditingTemplate(null);
    setTemplateForm({ name: '', template: '', description: '' });
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
      description="配置 AI 模型、API 密钥和提示词模板"
    >
      <Tabs defaultValue="ai-config" className="space-y-6">
        <TabsList>
          <TabsTrigger value="ai-config" className="gap-1.5">
            <SettingsIcon className="h-4 w-4" />
            AI 配置
          </TabsTrigger>
          <TabsTrigger value="templates" className="gap-1.5">
            <FileText className="h-4 w-4" />
            提示词模板
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

              <Button onClick={handleSaveConfig} disabled={saving} className="w-full sm:w-auto">
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                保存配置
              </Button>
            </div>
          </SectionCard>
        </TabsContent>

        <TabsContent value="templates">
          <SectionCard
            title="提示词模板管理"
            description="创建和管理 AI 生成内容的提示词模板"
            actions={
              <Button onClick={openCreateTemplate} size="sm">
                <Plus className="mr-1.5 h-4 w-4" />
                创建模板
              </Button>
            }
          >
            {templates.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="mx-auto h-12 w-12 opacity-50" />
                <p className="mt-2">还没有模板，点击上方按钮创建</p>
              </div>
            ) : (
              <div className="grid gap-3">
                {templates.map((template) => (
                  <Card key={template.id} className="shadow-none">
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <CardTitle className="text-base flex items-center gap-2">
                            {template.name}
                            {template.is_default && (
                              <Badge variant="secondary" className="text-xs">
                                <Star className="mr-1 h-3 w-3" />
                                默认
                              </Badge>
                            )}
                          </CardTitle>
                          {template.description && (
                            <CardDescription>{template.description}</CardDescription>
                          )}
                        </div>
                        <div className="flex gap-1">
                          {!template.is_default && (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => handleSetDefaultTemplate(template.id)}
                              title="设为默认"
                            >
                              <Star className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => startEditTemplate(template)}
                            title="编辑"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          {!template.is_default && (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => handleDeleteTemplate(template.id)}
                              title="删除"
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                  </Card>
                ))}
              </div>
            )}
          </SectionCard>
        </TabsContent>
      </Tabs>

      {/* Template Editor Dialog */}
      <Dialog
        open={showTemplateEditor || !!editingTemplate}
        onOpenChange={(open) => !open && closeTemplateEditor()}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? '编辑模板' : '创建模板'}</DialogTitle>
            <DialogDescription>
              {editingTemplate ? '修改模板内容和描述' : '创建一个新的提示词模板'}
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={editingTemplate ? handleUpdateTemplate : handleCreateTemplate}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="template-name">模板名称 *</Label>
              <Input
                id="template-name"
                value={templateForm.name}
                onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
                placeholder="例如：章节生成模板"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="template-content">模板内容 *</Label>
              <Textarea
                id="template-content"
                value={templateForm.template}
                onChange={(e) => setTemplateForm({ ...templateForm, template: e.target.value })}
                placeholder="输入提示词模板内容..."
                className="min-h-[200px] font-mono text-sm"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="template-desc">描述</Label>
              <Input
                id="template-desc"
                value={templateForm.description}
                onChange={(e) => setTemplateForm({ ...templateForm, description: e.target.value })}
                placeholder="简要描述这个模板的用途"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeTemplateEditor}>
                取消
              </Button>
              <Button type="submit" disabled={templateSaving}>
                {templateSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingTemplate ? '保存' : '创建'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

export default Settings;
