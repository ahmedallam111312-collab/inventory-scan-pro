import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useInventory } from '@/contexts/InventoryContext';
import { cn } from '@/lib/utils';
import {
  Package,
  LayoutDashboard,
  ScanLine,
  Boxes,
  ShieldCheck,
  LogOut,
  Wifi,
  WifiOff,
  Menu, // Imported Menu Icon
  X,    // Imported Close Icon
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface SidebarProps {
  className?: string;
}

const Sidebar: React.FC<SidebarProps> = ({ className }) => {
  const { user, signOut } = useAuth();
  const { isOnline } = useInventory();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false); // State for mobile menu

  const handleSignOut = async () => {
    await signOut();
    toast.success('تم تسجيل الخروج بنجاح');
    navigate('/login');
  };

  const navItems = [
    { to: '/', icon: LayoutDashboard, label: 'لوحة التحكم' },
    { to: '/scanner', icon: ScanLine, label: 'الماسح الضوئي' },
    { to: '/products', icon: Package, label: 'المنتجات' },
    { to: '/batches', icon: Boxes, label: 'الدفعات' },
    { to: '/admin', icon: ShieldCheck, label: 'لوحة المسؤول' },
  ];

  return (
    <>
      {/* 📱 Mobile Toggle Button (Visible only on mobile) */}
      <Button
        variant="outline"
        size="icon"
        className="fixed top-4 right-4 z-[60] md:hidden bg-background shadow-md"
        onClick={() => setIsOpen(!isOpen)}
      >
        {isOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </Button>

      {/* 🌑 Overlay (Background dim when menu is open) */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden backdrop-blur-sm"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* 📂 The Sidebar Itself */}
      <aside className={cn(
        "fixed right-0 top-0 h-full w-64 bg-sidebar border-l border-sidebar-border flex flex-col z-50 transition-transform duration-300 ease-in-out",
        // Mobile Logic: If open -> show (translate-0), If closed -> hide (translate-x-full)
        isOpen ? "translate-x-0" : "translate-x-full",
        // Desktop Logic: Always show (md:translate-x-0)
        "md:translate-x-0",
        className
      )}>
        {/* Logo Section */}
        <div className="p-6 border-b border-sidebar-border mt-12 md:mt-0"> {/* Added top margin on mobile for close button space */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center">
              <Package className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="font-bold text-lg text-sidebar-foreground font-heading">
                المخزن<span className="text-sidebar-primary">برو</span>
              </h1>
            </div>
          </div>
        </div>

        {/* Connection Status */}
        <div className="px-4 py-3 border-b border-sidebar-border">
          <div className={cn(
            "flex items-center gap-2 text-sm px-3 py-2 rounded-lg transition-colors",
            isOnline ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
          )}>
            {isOnline ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
            <span>{isOnline ? 'متصل بالإنترنت' : 'غير متصل'}</span>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setIsOpen(false)} // Close menu when clicking a link
              className={({ isActive }) => cn(
                "flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all",
                isActive
                  ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* User Profile & Logout */}
        <div className="p-4 border-t border-sidebar-border">
          <div className="mb-3 px-4">
            <p className="text-xs text-sidebar-foreground/60 mb-1">مسجل الدخول باسم:</p>
            <p className="text-sm font-medium text-sidebar-foreground truncate text-left" dir="ltr">
              {user?.email}
            </p>
          </div>
          <Button
            variant="ghost"
            className="w-full justify-start text-sidebar-foreground hover:bg-destructive/10 hover:text-destructive gap-2 transition-colors"
            onClick={handleSignOut}
          >
            <LogOut className="w-4 h-4" />
            تسجيل الخروج
          </Button>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;