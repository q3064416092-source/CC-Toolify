import { useAuthStore } from '@/stores/authStore';
import { useLogStore } from '@/stores/logStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Server, GitBranch, CheckCircle, XCircle, RefreshCw } from 'lucide-react';

export function DashboardPage() {
  const { bootstrap, loadBootstrap } = useAuthStore();
  const { getStats } = useLogStore();

  const stats = getStats();
  const providers = bootstrap?.providers || [];
  const mappings = bootstrap?.mappings || [];

  const statCards = [
    {
      title: '上游节点',
      value: providers.length,
      description: '已登记的 API 渠道数量',
      icon: Server,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
    },
    {
      title: '映射规则',
      value: mappings.length,
      description: '客户端可见的模型别名',
      icon: GitBranch,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
    },
    {
      title: '近期成功',
      value: stats.ok,
      description: '最近日志中状态为 ok',
      icon: CheckCircle,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
    },
    {
      title: '近期失败',
      value: stats.error,
      description: '优先排查这些请求',
      icon: XCircle,
      color: 'text-red-600',
      bgColor: 'bg-red-50',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Hero Section */}
      <Card className="bg-gradient-to-r from-teal-50 to-blue-50 border-teal-100">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="secondary">CC-Toolify</Badge>
                <span className="text-sm text-muted-foreground">上游代理与故障定位</span>
              </div>
              <CardTitle className="text-3xl">把 XML Shim 的状态摊在桌面上</CardTitle>
              <p className="text-muted-foreground mt-2 max-w-2xl">
                这个管理台只服务一种目标：把不支持原生工具调用的模型，稳定接入到支持 tools 的下游客户端。
                配置、测试、日志和近期故障都会集中展示，避免你在代理链路里盲查。
              </p>
            </div>
            <Button variant="outline" onClick={loadBootstrap}>
              <RefreshCw className="h-4 w-4 mr-2" />
              刷新数据
            </Button>
          </div>
        </CardHeader>
      </Card>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <Card key={card.title}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">{card.title}</p>
                  <p className="text-3xl font-bold mt-2">{card.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{card.description}</p>
                </div>
                <div className={`p-3 rounded-full ${card.bgColor}`}>
                  <card.icon className={`h-6 w-6 ${card.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="hover:shadow-lg transition-shadow cursor-pointer">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-blue-50">
                <Server className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <h3 className="font-semibold">管理上游服务</h3>
                <p className="text-sm text-muted-foreground">配置 API 渠道和认证信息</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow cursor-pointer">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-purple-50">
                <GitBranch className="h-6 w-6 text-purple-600" />
              </div>
              <div>
                <h3 className="font-semibold">配置模型映射</h3>
                <p className="text-sm text-muted-foreground">设置客户端别名到上游模型</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow cursor-pointer">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-orange-50">
                <CheckCircle className="h-6 w-6 text-orange-600" />
              </div>
              <div>
                <h3 className="font-semibold">查看请求日志</h3>
                <p className="text-sm text-muted-foreground">排查工具调用和路由问题</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
