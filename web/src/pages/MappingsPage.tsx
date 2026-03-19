import { useState, useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useProviderStore } from '@/stores/providerStore';
import { useMappingStore } from '@/stores/mappingStore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Edit, Trash2, TestTube, X } from 'lucide-react';
import type { ModelMapping, ModelMappingInput } from '@/types';

export function MappingsPage() {
  const { bootstrap } = useAuthStore();
  const { providers } = useProviderStore();
  const {
    mappings,
    isLoading,
    error,
    editingMapping,
    setEditingMapping,
    addMapping,
    editMapping,
    removeMapping,
    testMapping,
    clearError,
  } = useMappingStore();

  const [formData, setFormData] = useState<ModelMappingInput>({
    alias: '',
    providerId: '',
    upstreamModel: '',
    supportsStreaming: true,
  });

  // Sync with bootstrap data
  useEffect(() => {
    if (bootstrap?.mappings) {
      useMappingStore.getState().setMappings(bootstrap.mappings);
    }
  }, [bootstrap]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingMapping) {
        await editMapping(editingMapping.id, formData);
      } else {
        await addMapping(formData);
      }
      resetForm();
    } catch {
      // Error handled in store
    }
  };

  const resetForm = () => {
    setFormData({
      alias: '',
      providerId: providers[0]?.id || '',
      upstreamModel: '',
      supportsStreaming: true,
    });
    setEditingMapping(null);
    clearError();
  };

  const handleEdit = (mapping: ModelMapping) => {
    setEditingMapping(mapping);
    setFormData({
      alias: mapping.alias,
      providerId: mapping.providerId,
      upstreamModel: mapping.upstreamModel,
      supportsStreaming: mapping.supportsStreaming,
    });
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除这条模型映射吗？客户端将无法继续使用这个别名。')) return;
    try {
      await removeMapping(id);
    } catch {
      // Error handled in store
    }
  };

  const handleTest = async (id: string) => {
    try {
      await testMapping(id);
      alert('测试成功。映射配置正确。');
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
              <CardTitle>{editingMapping ? '编辑模型映射' : '新增模型映射'}</CardTitle>
              <CardDescription>
                客户端请求只认"别名"。真正要打到哪个上游模型、是否支持流式，由这里决定。工具请求默认固定走 XML Shim。
              </CardDescription>
            </div>
            <Badge variant="secondary">XML Shim Route</Badge>
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
              <Label htmlFor="alias">对外模型别名</Label>
              <Input
                id="alias"
                placeholder="例如：claude-code-proxy"
                value={formData.alias}
                onChange={(e) => setFormData({ ...formData, alias: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="providerId">目标上游服务</Label>
              <select
                id="providerId"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={formData.providerId}
                onChange={(e) => setFormData({ ...formData, providerId: e.target.value })}
                required
              >
                {providers.length === 0 ? (
                  <option value="">请先创建上游服务</option>
                ) : (
                  providers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.protocol})
                    </option>
                  ))
                )}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="upstreamModel">真实上游模型名</Label>
              <Input
                id="upstreamModel"
                placeholder="例如：qwen-max-latest"
                value={formData.upstreamModel}
                onChange={(e) => setFormData({ ...formData, upstreamModel: e.target.value })}
                required
              />
            </div>
            <div className="flex items-center gap-2 p-3 border rounded-md">
              <input
                type="checkbox"
                id="supportsStreaming"
                checked={formData.supportsStreaming}
                onChange={(e) => setFormData({ ...formData, supportsStreaming: e.target.checked })}
                className="h-4 w-4"
              />
              <Label htmlFor="supportsStreaming" className="mb-0">
                上游支持流式输出
              </Label>
            </div>
            <p className="text-xs text-muted-foreground">
              若这个选项关闭，映射仍会保存，但当前项目的工具调用稳定性会明显下降，不建议关闭。
            </p>
            <div className="flex gap-2">
              <Button type="submit" disabled={isLoading || providers.length === 0}>
                {isLoading ? '保存中...' : editingMapping ? '保存修改' : '保存映射'}
              </Button>
              {editingMapping && (
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
              <CardTitle>已生效映射</CardTitle>
              <CardDescription>
                "测试映射"会走真实代理链路，能帮助你确认别名命中、上游连通性和请求返回是否正常。
              </CardDescription>
            </div>
            <Badge variant="secondary">Alias Table</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4 max-h-[600px] overflow-y-auto">
            {mappings.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground border border-dashed rounded-lg">
                还没有任何模型映射。建议按"客户端别名 → 上游模型"的思路建立映射，并在保存后立即执行测试。
              </div>
            ) : (
              mappings.map((mapping) => (
                <div
                  key={mapping.id}
                  className="p-4 border rounded-lg hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="font-semibold">{mapping.alias}</h3>
                      <p className="text-sm text-muted-foreground">
                        目标上游: {mapping.providerName || '未知上游'} / {mapping.upstreamModel}
                      </p>
                    </div>
                    <Badge>XML Shim</Badge>
                  </div>
                  <div className="flex flex-wrap gap-2 mb-3">
                    <Badge variant="secondary">
                      stream {mapping.supportsStreaming ? '开启' : '关闭'}
                    </Badge>
                    <Badge variant="secondary">别名路由</Badge>
                    <Badge variant="secondary">工具调用经 XML 注入</Badge>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleEdit(mapping)}
                    >
                      <Edit className="h-4 w-4 mr-1" />
                      编辑
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleTest(mapping.id)}
                    >
                      <TestTube className="h-4 w-4 mr-1" />
                      测试映射
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleDelete(mapping.id)}
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
