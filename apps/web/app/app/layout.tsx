import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth, signOut } from '@/auth';
import { Button } from '@/components/ui/button';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  return (
    <div className="min-h-screen">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <nav className="flex items-center gap-6 text-sm font-medium">
            <Link href="/app" className="font-semibold">
              Kyujin
            </Link>
            <Link href="/app" className="text-muted-foreground hover:text-foreground">
              Applications
            </Link>
            <Link href="/app/insights" className="text-muted-foreground hover:text-foreground">
              Insights
            </Link>
            <Link href="/app/settings" className="text-muted-foreground hover:text-foreground">
              Settings
            </Link>
          </nav>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground">{session.user.email}</span>
            <form
              action={async () => {
                'use server';
                await signOut({ redirectTo: '/' });
              }}
            >
              <Button type="submit" variant="ghost" size="sm">
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
