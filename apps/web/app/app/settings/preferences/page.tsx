import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getUserProfile } from '@/lib/data';
import { PreferencesForm } from './preferences-form';
import type { ApplicationStatus } from '@kyujin/shared';

export default async function PreferencesPage() {
  const session = await auth();
  const userId = session!.user.id;
  const profile = await getUserProfile(userId);
  if (!profile) redirect('/login');

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Dashboard</CardTitle>
          <CardDescription>
            What you see first when you open Kyujin, and your weekly application target.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PreferencesForm
            section="dashboard"
            initial={{
              dashboardView: profile.dashboardView as 'flow' | 'activity' | 'outcomes',
              applicationGoal: profile.applicationGoal,
              defaultAppSort: profile.defaultAppSort as 'lastEvent' | 'company' | 'source',
              defaultAppRange: profile.defaultAppRange as
                | 'all'
                | '7d'
                | '30d'
                | '90d'
                | '365d',
              defaultAppDir: profile.defaultAppDir as 'asc' | 'desc',
              hideStatuses: (profile.hideStatuses ?? []) as ApplicationStatus[],
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Application list</CardTitle>
          <CardDescription>
            Defaults applied when you open the applications list with no filters in the URL.
            Shared links (?sort=…) still win over these.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PreferencesForm
            section="list"
            initial={{
              dashboardView: profile.dashboardView as 'flow' | 'activity' | 'outcomes',
              applicationGoal: profile.applicationGoal,
              defaultAppSort: profile.defaultAppSort as 'lastEvent' | 'company' | 'source',
              defaultAppRange: profile.defaultAppRange as
                | 'all'
                | '7d'
                | '30d'
                | '90d'
                | '365d',
              defaultAppDir: profile.defaultAppDir as 'asc' | 'desc',
              hideStatuses: (profile.hideStatuses ?? []) as ApplicationStatus[],
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
