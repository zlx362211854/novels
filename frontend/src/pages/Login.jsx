import { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { BookOpen, Loader2, LockKeyhole } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useFeedback } from '@/components/ui/FeedbackProvider';
import { useAuth } from '@/components/AuthProvider';

function Login() {
  const location = useLocation();
  const feedback = useFeedback();
  const auth = useAuth();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const redirectTo = location.state?.from?.pathname || '/';

  if (auth?.isAuthenticated) {
    return <Navigate to={redirectTo} replace />;
  }

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await auth.login(username, password);
    } catch (error) {
      feedback.error(error.response?.data?.error || '登录失败，请稍后再试。');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_hsl(176_62%_92%),_transparent_42%),linear-gradient(180deg,_hsl(176_45%_98%),_hsl(175_18%_94%))]">
      <div className="mx-auto flex min-h-screen max-w-6xl items-center justify-center px-4 py-12">
        <Card className="w-full max-w-md border-border/70 bg-background/92 shadow-[0_24px_80px_hsl(176_67%_20%/0.14)] backdrop-blur">
          <CardHeader className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/25">
                <BookOpen className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-xl">登录创作后台</CardTitle>
                <CardDescription>输入固定管理员账号后才能进入项目工作台。</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <Label htmlFor="username">用户名</Label>
                <Input id="username" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">密码</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                />
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LockKeyhole className="mr-2 h-4 w-4" />}
                登录
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default Login;
