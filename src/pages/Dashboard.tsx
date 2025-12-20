import React from 'react';
import { useInventory } from '@/contexts/InventoryContext';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Package, AlertTriangle, Activity, Boxes, DollarSign } from 'lucide-react';
import { format, isWithinInterval, addDays } from 'date-fns';

const Dashboard = () => {
  const { products, batches, auditLogs } = useInventory();

  const totalProducts = products.length;
  const totalStock = batches.reduce((sum, b) => sum + b.quantity, 0);
  const totalValue = products.reduce((sum, p) => {
    const pStock = batches.filter(b => b.product_id === p.id).reduce((s, b) => s + b.quantity, 0);
    return sum + (pStock * p.price);
  }, 0);

  const now = new Date();
  const expiringBatches = batches.filter(batch => {
    const expiryDate = new Date(batch.expiry_date);
    return isWithinInterval(expiryDate, { start: now, end: addDays(now, 7) });
  });

  const getActionName = (action: string) => {
    switch (action) {
      case 'SCAN_IN': return 'إضافة مخزون';
      case 'SCAN_OUT': return 'صرف مخزون';
      case 'ADJUST': return 'تعديل يدوي';
      default: return action;
    }
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold font-heading">لوحة التحكم</h1>
          <p className="text-muted-foreground mt-1">نظرة عامة على المخزون</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">المنتجات</CardTitle>
              <Package className="w-4 h-4 text-primary" />
            </CardHeader>
            <CardContent><div className="text-3xl font-bold">{totalProducts}</div></CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">إجمالي المخزون</CardTitle>
              <Boxes className="w-4 h-4 text-primary" />
            </CardHeader>
            <CardContent><div className="text-3xl font-bold">{totalStock}</div></CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">قيمة المخزون</CardTitle>
              <DollarSign className="w-4 h-4 text-primary" />
            </CardHeader>
            <CardContent><div className="text-3xl font-bold text-left" dir="ltr">${totalValue.toLocaleString()}</div></CardContent>
          </Card>

          <Card className={expiringBatches.length > 0 ? 'ring-2 ring-warning/50' : ''}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">تنتهي قريباً</CardTitle>
              <AlertTriangle className="w-4 h-4 text-warning" />
            </CardHeader>
            <CardContent><div className="text-3xl font-bold">{expiringBatches.length}</div></CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Activity className="w-5 h-5" /> النشاط الأخير</CardTitle>
            </CardHeader>
            <CardContent>
              {auditLogs.slice(0, 5).map(log => (
                <div key={log.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50 mb-2">
                  <div className="flex items-center gap-3">
                    <Badge variant="outline">{getActionName(log.action)}</Badge>
                    <div>
                      <p className="font-medium text-sm">{(log.details as any)?.product_name || 'منتج'}</p>
                      <p className="text-xs text-muted-foreground">{log.user_email}</p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground" dir="ltr">{format(new Date(log.created_at), 'HH:mm')}</p>
                </div>
              ))}
              {auditLogs.length === 0 && <p className="text-center text-muted-foreground">لا يوجد نشاط حديث</p>}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
};
export default Dashboard;