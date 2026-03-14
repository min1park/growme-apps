'use client';

import { AppContainer } from '@/components/AppContainer';
import { Toaster } from 'sonner';

export default function Home() {
  return (
    <>
      <AppContainer />
      <Toaster position="bottom-right" />
    </>
  );
}
