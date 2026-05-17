import { redirect } from 'next/navigation';
import { auth, signIn } from '@/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect('/app');

  const hasApple = Boolean(process.env.AUTH_APPLE_ID && process.env.AUTH_APPLE_SECRET);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 py-12">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Sign in to Kyujin</CardTitle>
          <CardDescription>
            Sign in with Google or Apple. We&apos;ll ask for Gmail access separately, only after you
            choose to connect it.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <form
            action={async () => {
              'use server';
              await signIn('google', { redirectTo: '/app' });
            }}
          >
            <Button type="submit" className="w-full" variant="default">
              Continue with Google
            </Button>
          </form>
          {hasApple && (
            <form
              action={async () => {
                'use server';
                await signIn('apple', { redirectTo: '/app' });
              }}
            >
              <Button type="submit" className="w-full" variant="outline">
                Continue with Apple
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
