import type { ReactNode } from 'react';
import './globals.css';
import { Geist } from "next/font/google";
import { cn } from "@/ui/utils";
import { LawyerPicker } from '@/features/lawyer/LawyerPicker';
import { QuotaBar } from '@/features/quota/QuotaBar';
import { Providers } from './providers';

const geist = Geist({subsets:['latin'],variable:'--font-sans'});


export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={cn("font-sans", geist.variable)}>
      <body>
        <Providers>
          <header className="flex items-center justify-between gap-4 border-b p-4">
            <QuotaBar />
            <LawyerPicker />
          </header>
          <main className="p-4">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
