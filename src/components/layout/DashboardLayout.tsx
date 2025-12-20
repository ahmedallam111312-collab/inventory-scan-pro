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
      {/* 👇 FIXED: Changed 'ml-64' to 'mr-64' */}
      <main className={cn("mr-64 min-h-screen p-6 transition-all duration-300", className)}>
        {children}
      </main>
    </div>
  );
};

export default DashboardLayout;