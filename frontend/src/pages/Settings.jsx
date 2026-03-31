import { useState, useEffect } from 'react';
import { configApi, templateApi } from '../services/api';

function Settings() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editForm, setEditForm] = useState({
    aiModel: 'zhipu',
    zhipuApiKey: '',
    deepseekApiKey: '',
    reviewStrictness: 'strict',
  });
  const [showTemplateEditor, setShowTemplateEditor] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [templateForm, setTemplateForm] = useState({ name: '', template: '', description: '' });

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
    } finally {
      setLoading(false);
    }
  };

  const handleSaveConfig = async () => {
    try {
      await configApi.update('aiModel', editForm.aiModel, '当前使用的AI模型');
      await configApi.update('zhipuApiKey', editForm.zhipuApiKey, '智谱AI API密钥');
      await configApi.update('deepseekApiKey', editForm.deepseekApiKey, 'DeepSeek API密钥');
      await configApi.update('reviewStrictness', editForm.reviewStrictness, '审核严格度');
      alert('配置保存成功');
    } catch (error) {
      console.error('保存配置失败:', error);
      alert('保存失败');
    }
  };

  const handleCreateTemplate = async (e) => {
    e.preventDefault();
    try {
      await templateApi.create(templateForm);
      setTemplateForm({ name: '', template: '', description: '' });
      setShowTemplateEditor(false);
      loadData();
    } catch (error) {
      console.error('创建模板失败:', error);
    }
  };

  const handleUpdateTemplate = async (e) => {
    e.preventDefault();
    try {
      await templateApi.update(editingTemplate.id, templateForm);
      setEditingTemplate(null);
      setTemplateForm({ name: '', template: '', description: '' });
      loadData();
    } catch (error) {
      console.error('更新模板失败:', error);
    }
  };

  const handleDeleteTemplate = async (id) => {
    if (!confirm('确定要删除这个模板吗？')) return;
    try {
      await templateApi.delete(id);
      loadData();
    } catch (error) {
      console.error('删除模板失败:', error);
    }
  };

  const handleSetDefaultTemplate = async (id) => {
    try {
      await templateApi.setDefault(id);
      loadData();
    } catch (error) {
      console.error('设置默认模板失败:', error);
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

  if (loading) {
    return <div className="flex justify-center items-center h-64">加载中...</div>;
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">系统设置</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div>
          <h2 className="text-xl font-semibold mb-4">AI配置</h2>
          <div className="border rounded-lg p-4 space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">AI模型</label>
              <select
                value={editForm.aiModel}
                onChange={(e) => setEditForm({ ...editForm, aiModel: e.target.value })}
                className="w-full border rounded px-3 py-2"
              >
                <option value="zhipu">智谱AI</option>
                <option value="deepseek">DeepSeek</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">智谱AI API Key</label>
              <input
                type="password"
                value={editForm.zhipuApiKey}
                onChange={(e) => setEditForm({ ...editForm, zhipuApiKey: e.target.value })}
                className="w-full border rounded px-3 py-2"
                placeholder="输入智谱AI API密钥"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">DeepSeek API Key</label>
              <input
                type="password"
                value={editForm.deepseekApiKey}
                onChange={(e) => setEditForm({ ...editForm, deepseekApiKey: e.target.value })}
                className="w-full border rounded px-3 py-2"
                placeholder="输入DeepSeek API密钥"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">审核严格度</label>
              <select
                value={editForm.reviewStrictness}
                onChange={(e) => setEditForm({ ...editForm, reviewStrictness: e.target.value })}
                className="w-full border rounded px-3 py-2"
              >
                <option value="strict">严格模式</option>
                <option value="loose">宽松模式</option>
              </select>
            </div>

            <button
              onClick={handleSaveConfig}
              className="w-full bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
            >
              保存配置
            </button>
          </div>
        </div>

        <div>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">提示词模板</h2>
            <button
              onClick={() => { setShowTemplateEditor(true); setEditingTemplate(null); }}
              className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
            >
              创建模板
            </button>
          </div>

          {(showTemplateEditor || editingTemplate) && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                <h3 className="text-lg font-bold mb-4">
                  {editingTemplate ? '编辑模板' : '创建模板'}
                </h3>
                <form onSubmit={editingTemplate ? handleUpdateTemplate : handleCreateTemplate}>
                  <div className="mb-4">
                    <label className="block text-sm font-medium mb-1">模板名称 *</label>
                    <input
                      type="text"
                      value={templateForm.name}
                      onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
                      className="w-full border rounded px-3 py-2"
                      required
                    />
                  </div>
                  <div className="mb-4">
                    <label className="block text-sm font-medium mb-1">模板内容 *</label>
                    <textarea
                      value={templateForm.template}
                      onChange={(e) => setTemplateForm({ ...templateForm, template: e.target.value })}
                      className="w-full border rounded px-3 py-2 font-mono text-sm"
                      rows={10}
                      required
                    />
                  </div>
                  <div className="mb-4">
                    <label className="block text-sm font-medium mb-1">描述</label>
                    <input
                      type="text"
                      value={templateForm.description}
                      onChange={(e) => setTemplateForm({ ...templateForm, description: e.target.value })}
                      className="w-full border rounded px-3 py-2"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => { setShowTemplateEditor(false); setEditingTemplate(null); }}
                      className="px-4 py-2 border rounded hover:bg-gray-100"
                    >
                      取消
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                    >
                      {editingTemplate ? '保存' : '创建'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {templates.map(template => (
              <div key={template.id} className="border rounded p-3">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="font-medium">{template.name}</span>
                    {template.is_default && (
                      <span className="ml-2 text-xs bg-blue-100 text-blue-600 px-2 py-1 rounded">默认</span>
                    )}
                    {template.description && (
                      <p className="text-sm text-gray-500 mt-1">{template.description}</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {!template.is_default && (
                      <button
                        onClick={() => handleSetDefaultTemplate(template.id)}
                        className="text-xs text-blue-500 hover:underline"
                      >
                        设为默认
                      </button>
                    )}
                    <button
                      onClick={() => startEditTemplate(template)}
                      className="text-xs text-blue-500 hover:underline"
                    >
                      编辑
                    </button>
                    {!template.is_default && (
                      <button
                        onClick={() => handleDeleteTemplate(template.id)}
                        className="text-xs text-red-500 hover:underline"
                      >
                        删除
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Settings;
