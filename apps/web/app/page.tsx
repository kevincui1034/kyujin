import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { auth } from '@/auth';

export default async function HomePage() {
  const session = await auth();

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center px-6 py-12 text-center">
      <h1 className="text-5xl font-semibold tracking-tight">Kyujin</h1>
      <p className="mt-4 text-lg text-muted-foreground">
        Your job application tracker, on autopilot.
      </p>
      <p className="mt-2 max-w-prose text-sm text-muted-foreground">
        Connect Gmail and Kyujin automatically detects application confirmations, interview
        invitations, rejections, and offers — then surfaces them in a dashboard built for the job
        hunt grind.
      </p>
      <div className="mt-8 flex gap-3">
        {session?.user ? (
          <Button asChild>
            <Link href="/app">Open dashboard</Link>
          </Button>
        ) : (
          <Button asChild>
            <Link href="/login">Get started</Link>
          </Button>
        )}
      </div>
    </main>
  );
}
