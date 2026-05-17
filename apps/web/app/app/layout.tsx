import { redirect } from 'next/navigation';
import { auth, signOut } from '@/auth';
import { PillowBG } from '@/components/yume/pillow-bg';
import { YumeNav } from '@/components/yume/yume-nav';
import { getUserProfile } from '@/lib/data';
import { ChatMount } from '@/components/agent/chat-mount';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/login');
  const profile = await getUserProfile(session.user.id);
  const email = profile?.email ?? session.user.email ?? '';
  const displayName = profile?.name?.trim() || null;

  const signOutForm = (
    <form
      action={async () => {
        'use server';
        await signOut({ redirectTo: '/' });
      }}
    >
      <button
        type="submit"
        className="rounded-full px-3 py-1 text-[12px] font-medium transition-colors hover:bg-yume-pink-50"
        style={{ color: 'var(--yume-ink-muted)' }}
      >
        Sign out
      </button>
    </form>
  );

  return (
    <div className="relative min-h-screen overflow-hidden">
      <PillowBG id="app" />
      <div className="relative z-[2] flex min-h-screen flex-col">
        <YumeNav email={email} displayName={displayName} signOut={signOutForm} />
        <main className="flex-1 px-7 pb-8 pt-2">{children}</main>
      </div>
      <ChatMount />
    </div>
  );
}
