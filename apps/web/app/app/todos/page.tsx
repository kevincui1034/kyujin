import { desc, eq } from 'drizzle-orm';
import { db } from '@kyujin/db/client';
import { todoJobs, type TodoJob } from '@kyujin/db/schema';
import { auth } from '@/auth';
import { Eyebrow } from '@/components/kyujin/eyebrow';
import { TodosClient } from './todos-client';

export const dynamic = 'force-dynamic';

export default async function TodosPage() {
  const session = await auth();
  const userId = session!.user.id;

  const rows: TodoJob[] = await db
    .select()
    .from(todoJobs)
    .where(eq(todoJobs.userId, userId))
    .orderBy(desc(todoJobs.createdAt));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow color="var(--kyujin-pink-600)">TO DO</Eyebrow>
          <h1
            className="serif mt-1"
            style={{ fontSize: 44, lineHeight: 1, letterSpacing: '-0.028em', color: 'var(--kyujin-ink)' }}
          >
            Jobs <span className="serif-italic" style={{ color: 'var(--kyujin-pink-500)' }}>worth chasing.</span>
          </h1>
          <p
            className="mt-2"
            style={{ fontSize: 13, color: 'var(--kyujin-ink-soft)', lineHeight: 1.5, maxWidth: 540 }}
          >
            Paste a job link to save it for later. Notes live on the side — keep a thought
            next to each one and circle back when you&apos;re ready to apply.
          </p>
        </div>
      </div>

      <TodosClient initial={rows} />
    </div>
  );
}
