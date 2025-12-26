import React, { useRef, useState, useMemo } from 'react';
import { useInventory } from '@/contexts/InventoryContext';
import { useAuth } from '@/contexts/AuthContext';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  ShieldCheck, Download, Upload, DollarSign, AlertTriangle,
  Activity, FileSpreadsheet, Loader2, Trash2, Box
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';

// 🔒 REPLACE THIS WITH YOUR REAL ADMIN EMAIL
const ADMIN_EMAIL = "ahmedallam111312@gmail.com";

const Admin = () => {
  // FIXED: Added " = []" defaults. This stops the "undefined reading reduce" crash.
  const { products = [], auditLogs = [], fetchProducts, clearAllData, addProduct } = useInventory();

  const { user } = useAuth();
  const [isImporting, setIsImporting] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isAdmin = user?.email === ADMIN_EMAIL;

  // --- STATS ---
  const stats = useMemo(() => {
    // Extra safety check
    const safeProducts = products || [];

    const totalVal = safeProducts.reduce((sum, p) => {
      const price = Number(p.price) || 0;
      const qty = Number(p.quantity) || 0;
      return sum + (price * qty);
    }, 0);

    const lowStock = safeProducts.filter(p => (Number(p.quantity) || 0) <= (p.reorderPoint || 10)).length;

    return { totalVal, lowStock, count: safeProducts.length };
  }, [products]);

  const recentActivity = (auditLogs || []).slice(0, 10);

  // --- DELETE ALL DATA ---
  const handleClearAll = async () => {
    if (!isAdmin) {
      toast.error("Permission Denied", { description: "Only Admin can perform this action." });
      return;
    }

    if (
      window.confirm("⚠️ DANGER: Are you sure you want to delete ALL data?") &&
      window.confirm("This action cannot be undone. All products and logs will be lost forever. Proceed?")
    ) {
      setIsClearing(true);
      await clearAllData();
      setIsClearing(false);
    }
  };

  // --- IMPORT LOGIC ---
  const handleImportClick = () => {
    if (!isAdmin) {
      toast.error("Access Denied", { description: "Only the Admin account can import inventory." });
      return;
    }
    fileInputRef.current?.click();
  };

  const processImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    const reader = new FileReader();

    reader.onload = async (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);

        toast.info("Importing...", { description: `Processing ${jsonData.length} rows.` });

        let successCount = 0;

        for (const row of jsonData as any[]) {
          const getValue = (key: string) => {
            const foundKey = Object.keys(row).find(k => k.toLowerCase().includes(key));
            return foundKey ? row[foundKey] : undefined;
          };

          const sku = getValue('sku');
          const name = getValue('name') || getValue('product');
          const price = getValue('price');
          const quantity = getValue('qty') || getValue('quantity') || 0;

          if (sku && name) {
            const exists = (products || []).find(p => p.sku === String(sku));
            if (!exists) {
              await addProduct({
                sku: String(sku),
                name: String(name),
                price: Number(price) || 0,
                quantity: Number(quantity),
                category: 'Imported',
                reorderPoint: 10
              });
              successCount++;
            }
          }
        }

        toast.success("Import Complete!", { description: `Added ${successCount} new products.` });
        if (fetchProducts) fetchProducts();

      } catch (error: any) {
        console.error(error);
        toast.error("Import Failed", { description: error.message });
      } finally {
        setIsImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // --- EXPORT LOGIC ---
  const exportInventoryReport = () => {
    try {
      const data = (products || []).map(product => ({
        'Product': product.name,
        'SKU': product.sku,
        'Category': product.category || '-',
        'Price': product.price,
        'Quantity': product.quantity || 0,
        'Total Value': (Number(product.price) || 0) * (Number(product.quantity) || 0),
      }));

      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Inventory');
      XLSX.writeFile(wb, `inventory-report-${new Date().toISOString().split('T')[0]}.xlsx`);
      toast.success('Report exported successfully');
    } catch (error) { toast.error('Failed to export'); }
  };

  const getActionColor = (action: string) => {
    switch (action) {
      case 'SCAN_IN': return 'bg-green-100 text-green-700';
      case 'SCAN_OUT': return 'bg-orange-100 text-orange-700';
      case 'ADJUST': return 'bg-blue-100 text-blue-700';
      case 'DELETE': return 'bg-red-100 text-red-700';
      default: return 'bg-slate-100 text-slate-600';
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6" dir="rtl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold font-heading flex items-center gap-3">
              <ShieldCheck className="w-8 h-8 text-blue-600" />
              لوحة التحكم (Admin)
            </h1>
            <div className="text-muted-foreground mt-1 flex items-center gap-2">
              <span>المستخدم:</span>
              <span className="font-mono text-blue-600">{user?.email}</span>
              {isAdmin && <Badge className="bg-blue-600">مسؤول</Badge>}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-blue-600" />
              إدارة البيانات
            </CardTitle>
            <CardDescription>
              استيراد وتصدير البيانات أو حذف النظام بالكامل (خطر)
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-4 items-center">
            {/* Import */}
            <input type="file" ref={fileInputRef} onChange={processImport} className="hidden" accept=".xlsx,.xls,.csv" />
            <Button
              onClick={handleImportClick}
              className={isAdmin ? "bg-blue-600 hover:bg-blue-700" : "opacity-50 cursor-not-allowed"}
              disabled={isImporting || isClearing}
            >
              {isImporting ? <Loader2 className="w-4 h-4 ml-2 animate-spin" /> : <Upload className="w-4 h-4 ml-2" />}
              استيراد Excel
            </Button>

            {/* Export */}
            <Button onClick={exportInventoryReport} variant="outline" disabled={isImporting || isClearing}>
              <Download className="w-4 h-4 ml-2" />
              تصدير تقرير
            </Button>

            {/* DANGER: Clear Data */}
            <div className="mr-auto">
              <Button
                onClick={handleClearAll}
                variant="destructive"
                disabled={isClearing || isImporting || !isAdmin}
              >
                {isClearing ? <Loader2 className="w-4 h-4 ml-2 animate-spin" /> : <Trash2 className="w-4 h-4 ml-2" />}
                حذف جميع البيانات
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border-slate-200">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">إجمالي قيمة المخزون</CardTitle>
              <DollarSign className="w-4 h-4 text-green-600" />
            </CardHeader>
            <CardContent><div className="text-3xl font-bold text-slate-800">{stats.totalVal.toLocaleString()} ج.م</div></CardContent>
          </Card>

          <Card className={`border-slate-200 ${stats.lowStock > 0 ? 'border-orange-200 bg-orange-50' : ''}`}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">نواقص (مخزون منخفض)</CardTitle>
              <AlertTriangle className={`w-4 h-4 ${stats.lowStock > 0 ? 'text-orange-600' : 'text-slate-400'}`} />
            </CardHeader>
            <CardContent><div className={`text-3xl font-bold ${stats.lowStock > 0 ? 'text-orange-700' : 'text-slate-800'}`}>{stats.lowStock}</div></CardContent>
          </Card>

          <Card className="border-slate-200">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">إجمالي المنتجات</CardTitle>
              <Box className="w-4 h-4 text-blue-600" />
            </CardHeader>
            <CardContent><div className="text-3xl font-bold text-slate-800">{stats.count}</div></CardContent>
          </Card>
        </div>

        {/* Activity Table */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Activity className="w-5 h-5 text-blue-600" /> سجل النشاطات الحديثة</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">التوقيت</TableHead>
                  <TableHead className="text-right">المستخدم</TableHead>
                  <TableHead className="text-right">الإجراء</TableHead>
                  <TableHead className="text-right">التفاصيل</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentActivity.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-slate-500">لا يوجد نشاطات مسجلة</TableCell>
                  </TableRow>
                ) : (
                  recentActivity.map(log => {
                    const details = log.details as any;
                    return (
                      <TableRow key={log.id}>
                        <TableCell className="font-mono text-sm text-right" dir="ltr">
                          {new Date(log.created_at).toLocaleString('ar-EG')}
                        </TableCell>
                        <TableCell className="text-sm">{log.user_email}</TableCell>
                        <TableCell><Badge className={getActionColor(log.action)}>{log.action}</Badge></TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {details?.product_name || details?.name || 'منتج'}
                          {details?.quantity_added ? ` (+${details.quantity_added})` : ''}
                          {details?.quantity_removed ? ` (-${details.quantity_removed})` : ''}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Admin;