import React, { useRef, useState } from 'react';
import { useInventory } from '@/contexts/InventoryContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client'; // Need direct access for Bulk Upsert
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
  const { products, auditLogs, fetchProducts, clearAllData } = useInventory();
  const { user } = useAuth();
  const [isImporting, setIsImporting] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isAdmin = user?.email === ADMIN_EMAIL;

  // --- STATS ---
  const totalValue = products.reduce((sum, p) => sum + ((p.price || 0) * (p.quantity || 0)), 0);
  const lowStockCount = products.filter(p => (p.quantity || 0) <= (p.reorderPoint || 10)).length;
  const recentActivity = auditLogs.slice(0, 10);

  // --- SAFE DELETE ALL ---
  const handleClearAll = async () => {
    if (!isAdmin) {
      toast.error("غير مصرح لك", { description: "فقط المسؤول يمكنه حذف البيانات" });
      return;
    }

    if (
      window.confirm("⚠️ تحذير: هل أنت متأكد من حذف جميع البيانات؟") &&
      window.confirm("لا يمكن التراجع عن هذا الإجراء. سيتم حذف جميع المنتجات والسجلات.")
    ) {
      try {
        setIsClearing(true);
        await clearAllData();
      } catch (e) {
        console.error(e);
      } finally {
        setIsClearing(false); // Ensure spinner stops
      }
    }
  };

  // --- NEW BULK IMPORT LOGIC ---
  const handleImportClick = () => {
    if (!isAdmin) {
      toast.error("غير مصرح لك", { description: "فقط المسؤول يمكنه استيراد البيانات" });
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

        toast.info("جاري الاستيراد...", { description: `جاري معالجة ${jsonData.length} منتج.` });

        // Prepare data for Bulk Upsert
        const productsToUpsert = [];

        for (const row of jsonData as any[]) {
          // Flexible key matching
          const getValue = (key: string) => {
            const foundKey = Object.keys(row).find(k => k.toLowerCase().includes(key));
            return foundKey ? row[foundKey] : undefined;
          };

          const sku = getValue('sku');
          const name = getValue('name') || getValue('product');
          const price = getValue('price');
          const quantity = getValue('qty') || getValue('quantity') || 0;

          if (sku && name) {
            productsToUpsert.push({
              sku: String(sku).trim(), // Clean spaces
              name: String(name).trim(),
              price: Number(price) || 0,
              quantity: Number(quantity),
              category: 'Imported',
              reorderPoint: 10
            });
          }
        }

        if (productsToUpsert.length === 0) {
          toast.warning("الملف فارغ أو التنسيق غير صحيح");
          setIsImporting(false);
          return;
        }

        // --- THE FIX: USE UPSERT (Update if exists, Insert if new) ---
        const { error } = await supabase
          .from('products')
          .upsert(productsToUpsert, { onConflict: 'sku' }); // Ensure 'sku' is unique in DB settings

        if (error) throw error;

        toast.success("تم الاستيراد بنجاح!", { description: `تم تحديث/إضافة ${productsToUpsert.length} منتج.` });

        // Refresh UI
        await fetchProducts();

      } catch (error: any) {
        console.error(error);
        toast.error("فشل الاستيراد", { description: error.message });
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
      const data = products.map(product => ({
        'المنتج': product.name,
        'SKU': product.sku,
        'التصنيف': product.category || '-',
        'السعر': product.price,
        'الكمية': product.quantity || 0,
        'القيمة الإجمالية': (product.price || 0) * (product.quantity || 0),
      }));

      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Inventory');
      XLSX.writeFile(wb, `inventory-report-${new Date().toISOString().split('T')[0]}.xlsx`);
      toast.success('تم تصدير التقرير');
    } catch (error) { toast.error('فشل التصدير'); }
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
              استيراد وتصدير البيانات أو إعادة تعيين النظام
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
            <CardContent><div className="text-3xl font-bold text-slate-800">{totalValue.toLocaleString()} ج.م</div></CardContent>
          </Card>

          <Card className={`border-slate-200 ${lowStockCount > 0 ? 'border-orange-200 bg-orange-50' : ''}`}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">نواقص (مخزون منخفض)</CardTitle>
              <AlertTriangle className={`w-4 h-4 ${lowStockCount > 0 ? 'text-orange-600' : 'text-slate-400'}`} />
            </CardHeader>
            <CardContent><div className={`text-3xl font-bold ${lowStockCount > 0 ? 'text-orange-700' : 'text-slate-800'}`}>{lowStockCount}</div></CardContent>
          </Card>

          <Card className="border-slate-200">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">إجمالي المنتجات</CardTitle>
              <Box className="w-4 h-4 text-blue-600" />
            </CardHeader>
            <CardContent><div className="text-3xl font-bold text-slate-800">{products.length}</div></CardContent>
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
                        <TableCell className="font-mono text-sm" dir="ltr" className="text-right">
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