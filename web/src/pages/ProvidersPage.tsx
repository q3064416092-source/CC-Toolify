import { useState, useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useProviderStore } from '@/stores/providerStore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Edit, Trash2, TestTube, X } from 'lucide-react';
import type { Provider, ProviderInput } from '@/types';
import { getProtocolText, getShimStyleText } from '@/lib/utils';

export function ProvidersPage() {
  const { bootstrap } = useAuthStore();
  const {
    providers,
    isLoading,
    error,
    editingProvider,
    setEditingProvider,
    addProvider,
    editProvider,
    removeProvider,
    testProvider,
    clearError,
  } = useProviderStore();

  const [formData, setFormData] = useState<ProviderInput>({
    name: '',
    protocol: 'openai',
    baseUrl: '',
    shimStyle: 'legacy',
    apiKey: '',
  });

  // Sync with bootstrap data
  useEffect(() => {
    if (bootstrap?.providers) {
      useProviderStore.getState().setProviders(bootstrap.providers);
    }
  }, [bootstrap]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingProvider) {
        await editProvider(editingProvider.id, formData);
      } else {
        await addProvider(formData);
      }
      resetForm();
    } catch {
      // Error handled in store
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      protocol: 'openai',
      baseUrl: '',
      shimStyle: 'legacy',
      apiKey: '',
    });
    setEditingProvider(null);
    clearError();
  };

  const handleEdit = (provider: Provider) => {
    setEditingProvider(provider);
    setFormData({
      name: provider.name,
      protocol: provider.protocol,
      baseUrl: provider.baseUrl,
      shimStyle: provider.shimStyle,
      apiKey: '',
    });
  };

  const handleDelete = async (id: string) => {
    if (!confirm('删除上游前，请先确认相关模型映射已经清理。确定删除吗？')) return;
    try {
      await removeProvider(id);
    } catch {
      // Error handled in store
    }
  };

  const handleTest = async (id: string) => {
    try {
      await testProvider(id);
      alert('上游基础配置校验通过。建议继续测试映射。');
    } catch (err) {
      alert(err instanceof Error ? err.message : '测试失败');
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Form */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{editingProvider ? '编辑上游服务' : '新增上游服务'}</CardTitle>
              <CardDescription>
                支持 OpenAI 兼容和 Anthropic 兼容接口。编辑已有节点时，若不打算更换密钥，API Key 留空即可。
              </CardDescription>
            </div>
            <Badge variant="secondary">节点配置</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="flex items-center gap-2 p-3 mb-4 text-sm text-red-600 bg-red-50 rounded-md">
              <AlertCircle className="h-4 w-4" />
              <span>{error}</span>
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">显示名称</Label>
              <Input
                id="name"
                placeholder="例如：OpenRouter 主站"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="protocol">协议类型</Label>
                <select
                  id="protocol"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={formData.protocol}
                  onChange={(e) => setFormData({ ...formData, protocol: e.target.value as 'openai' | 'anthropic' })}
                >
                  <option value="openai">OpenAI 兼容</option>
                  <option value="anthropic">Anthropic 兼容</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="shimStyle">Shim 结构样式</Label>
                <select
                  id="shimStyle"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={formData.shimStyle}
                  onChange={(e) => setFormData({ ...formData, shimStyle: e.target.value as 'legacy' | 'private_v1' })}
                >
                  <option value="legacy">旧样式</option>
                  <option value="private_v1">差异化样式</option>
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="baseUrl">基础地址</Label>
              <Input
                id="baseUrl"
                placeholder="https://api.example.com"
                value={formData.baseUrl}
                onChange={(e) => setFormData({ ...formData, baseUrl: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="apiKey">API Key</Label>
              <Input
                id="apiKey"
                type="password"
                placeholder={editingProvider ? '新增必填，编辑可留空' : '请输入 API Key'}
                value={formData.apiKey}
                onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                required={!editingProvider}
              />
              <p className="text-xs text-muted-foreground">
                控制台不会回显已有密钥。编辑时只有输入新值才会覆盖旧值。
              </p>
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={isLoading}>
                {isLoading ? '保存中...' : editingProvider ? '保存修改' : '保存上游'}
              </Button>
              {editingProvider && (
                <Button type="button" variant="outline" onClick={resetForm}>
                  <X className="h-4 w-4 mr-2" />
                  取消编辑
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {/* List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>已配置上游</CardTitle>
              <CardDescription>
                建议每次新增或改动后先做"校验配置"，再去映射页做真实模型调用测试。
              </CardDescription>
            </div>
            <Badge variant="secondary">Provider List</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4 max-h-[600px] overflow-y-auto">
            {providers.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground border border-dashed rounded-lg">
                还没有任何上游配置。建议先新增一个已知可用的兼容接口，再进入模型映射页。
              </div>
            ) : (
              providers.map((provider) => (
                <div
                  key={provider.id}
                  className="p-4 border rounded-lg hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="font-semibold">{provider.name}</h3>
                      <p className="text-sm text-muted-foreground">{provider.baseUrl}</p>
                    </div>
                    <Badge variant="outline">{getProtocolText(provider.protocol)}</Badge>
                  </div>
                  <div className="flex flex-wrap gap-2 mb-3">
                    <Badge variant="secondary">接口协议 {provider.protocol}</Badge>
                    <Badge variant="secondary">shim {getShimStyleText(provider.shimStyle)}</Badge>
                    <Badge variant="secondary">可用于多模型映射</Badge>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleEdit(provider)}
                    >
                      <Edit className="h-4 w-4 mr-1" />
                      编辑
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleTest(provider.id)}
                    >
                      <TestTube className="h-4 w-4 mr-1" />
                      校验配置
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleDelete(provider.id)}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      删除
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
