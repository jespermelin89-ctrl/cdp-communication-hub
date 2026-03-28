'use client';

import dynamic from 'next/dynamic';

const ChatWidget = dynamic(() => import('@/components/ChatWidget'), { ssr: false, loading: () => null });
const BottomNav = dynamic(() => import('@/components/BottomNav'), { ssr: false });
const OnboardingWizard = dynamic(() => import('@/components/OnboardingWizard'), { ssr: false });
const HighPriorityAlert = dynamic(() => import('@/components/HighPriorityAlert'), { ssr: false });
const GlobalShortcuts = dynamic(() => import('@/components/GlobalShortcuts'), { ssr: false });
const ShortcutsHelpModal = dynamic(() => import('@/components/ShortcutsHelpModal'), { ssr: false });

export default function ClientShell() {
  return (
    <>
      <ChatWidget />
      <BottomNav />
      <OnboardingWizard />
      <HighPriorityAlert />
      <GlobalShortcuts />
      <ShortcutsHelpModal />
    </>
  );
}
