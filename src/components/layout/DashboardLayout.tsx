import React from 'react';
import Sidebar from './Sidebar';
import { cn } from '@/lib/utils';

interface DashboardLayoutProps {
  children: React.ReactNode;
  className?: string;
}

const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children, className }) => {
  return (
    <div className="min-h-screen bg-background font-sans" dir="rtl">
      <Sidebar />
      {/* 👇 FIXED: 'mr-64' only applies on medium screens (md:mr-64) */}
      {/* On mobile, margin is 0, so content uses full width */}
      <main className={cn("md:mr-64 min-h-screen p-4 md:p-6 transition-all duration-300", className)}>
        {children}
      </main>
    </div>
  );
};

export default DashboardLayout;