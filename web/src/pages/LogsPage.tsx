import { useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useLogStore } from '@/stores/logStore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RefreshCw } from 'lucide-react';
import type { LogStatus } from '@/types';
import { formatDate, getStatusText } from '@/lib/utils';

const filters: { value: LogStatus | 'all'; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'started', label: '处理中' },
  { value: 'ok', label: '成功' },
  { value: 'error', label: '失败' },
];

export function LogsPage() {
  const { bootstrap, loadBootstrap } = useAuthStore();
  const { filter, setFilter, setLogs, getFilteredLogs } = useLogStore();

  // Sync with bootstrap data
  useEffect(() => {
    if (bootstrap?.logs) {
      setLogs(bootstrap.logs);
    }
  }, [bootstrap, setLogs]);

  const filteredLogs = getFilteredLogs();

  const getStatusVariant = (status: LogStatus) => {
    switch (status) {
      case 'ok':
        return 'success';
      case 'error':
        return 'destructive';
      case 'started':
        return 'warning';
      default:
        return 'secondary';
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>请求调用日志</CardTitle>
            <CardDescription>
              每个进入代理的请求都会先落一条 started 记录，完成后再更新为 ok 或 error。
              如果工具调用异常、卡住、超时，这里是第一排查入口。
            </CardDescription>
          </div>
          <Button variant="outline" onClick={loadBootstrap}>
            <RefreshCw className="h-4 w-4 mr-2" />
            刷新日志
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* Filters */}
        <div className="flex flex-wrap gap-2 mb-6">
          {filters.map((f) => (
            <Button
              key={f.value}
              variant={filter === f.value ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter(f.value)}
            >
              {f.label}
            </Button>
          ))}
        </div>

        {/* Logs List */}
        <div className="space-y-4 max-h-[700px] overflow-y-auto">
          {filteredLogs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground border border-dashed rounded-lg">
              当前筛选条件下没有日志。你可以先执行一次映射测试，再回到这里看链路记录。
            </div>
          ) : (
            filteredLogs.map((log) => (
              <div
                key={log.id}
                className="p-4 border rounded-lg hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="font-semibold">{log.route}</h3>
                    <p className="text-sm text-muted-foreground">
                      客户端协议: {log.clientProtocol} / 模型别名: {log.model}
                    </p>
                  </div>
                  <Badge variant={getStatusVariant(log.status)}>
                    {getStatusText(log.status)}
                  </Badge>
                </div>
                <div className="text-sm text-muted-foreground space-y-1">
                  <p>
                    命中上游: {log.providerName || '未命中'} / 实际模型: {log.upstreamModel || '-'}
                  </p>
                  <p>
                    耗时: {log.durationMs == null ? '处理中' : `${log.durationMs}ms`} / 时间:{' '}
                    {formatDate(log.createdAt)}
                  </p>
                </div>
                {log.detail && (
                  <div className="mt-3 p-3 bg-slate-900 text-slate-100 rounded-md text-sm font-mono overflow-x-auto">
                    <pre>{log.detail}</pre>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
