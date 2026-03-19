import { useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle } from 'lucide-react';

export function LoginPage() {
  const [password, setPassword] = useState('');
  const { login, isLoading, error, clearError } = useAuthStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;
    await login(password);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <span className="font-semibold text-primary">CC-Toolify</span>
            <span>XML Shim 控制台</span>
          </div>
          <CardTitle className="text-2xl">让不支持工具调用的上游也能稳定干活</CardTitle>
          <CardDescription>
            登录后可管理上游、维护映射、验证连通性，并用请求日志排查工具调用失败、超时和模型路由问题。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="flex items-center gap-2 p-3 text-sm text-red-600 bg-red-50 rounded-md">
                <AlertCircle className="h-4 w-4" />
                <span>{error}</span>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="password">管理员密码</Label>
              <Input
                id="password"
                type="password"
                placeholder="请输入控制台密码"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  clearError();
                }}
                disabled={isLoading}
              />
            </div>
            <Button type="submit" className="w-full" disabled={isLoading || !password.trim()}>
              {isLoading ? '登录中...' : '登录控制台'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
