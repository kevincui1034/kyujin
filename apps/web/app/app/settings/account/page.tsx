import { auth } from '@/auth';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getUserProfile } from '@/lib/data';
import { DisplayNameForm } from '../display-name-form';
import { FeedbackForm } from '../feedback-form';

export default async function AccountSettingsPage() {
  const session = await auth();
  const userId = session!.user.id;
  const profile = await getUserProfile(userId);
  const isPremium = profile?.plan === 'premium';
  const email = profile?.email ?? session!.user.email ?? '';

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription className="flex flex-wrap items-center gap-2">
            <Badge variant={isPremium ? 'default' : 'muted'}>
              {isPremium ? 'Premium' : 'Free'}
            </Badge>
            <span>Signed in as {email}</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DisplayNameForm initialName={profile?.name ?? null} email={email} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Feedback</CardTitle>
          <CardDescription>
            Found a bug or have an idea? Send it straight to the team.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FeedbackForm />
        </CardContent>
      </Card>
    </div>
  );
}
