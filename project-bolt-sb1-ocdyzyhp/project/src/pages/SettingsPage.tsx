import { DemoLoginSetting } from '@/components/settings/DemoLoginSetting';
import { StaffAccountsSection } from '@/components/settings/StaffAccountsSection';
import { PageHeader } from '@/components/ui/PageHeader';
import { useLanguage } from '@/hooks/useLanguage';

interface SettingsPageProps {
  currentUserId: string;
}

export function SettingsPage({ currentUserId }: SettingsPageProps) {
  const { t } = useLanguage();

  return (
    <div className="space-y-8">
      <PageHeader title={t('settings_title')} subtitle={t('settings_subtitle')} />
      <DemoLoginSetting />
      <StaffAccountsSection currentUserId={currentUserId} />
    </div>
  );
}
