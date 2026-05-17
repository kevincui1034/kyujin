import { asc, eq } from 'drizzle-orm';
import { db } from '@kyujin/db/client';
import { userSenderRules } from '@kyujin/db/schema';
import { auth } from '@/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RulesEditor } from './rules-editor';

export default async function RulesPage() {
  const session = await auth();
  const userId = session!.user.id;

  const rules = await db
    .select()
    .from(userSenderRules)
    .where(eq(userSenderRules.userId, userId))
    .orderBy(asc(userSenderRules.type), asc(userSenderRules.domain));

  const initialAllow = rules.filter((r) => r.type === 'allow');
  const initialBlock = rules.filter((r) => r.type === 'block');

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Allow / block list</CardTitle>
          <CardDescription>
            Override Kyujin&apos;s built-in classifier. Allow forces a sender through to the LLM
            even if it wouldn&apos;t normally qualify. Block silently ignores everything from that
            sender. Use the domain only — e.g. <code className="rounded bg-muted px-1">stripe.com</code>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RulesEditor initialAllow={initialAllow} initialBlock={initialBlock} />
        </CardContent>
      </Card>
    </div>
  );
}
