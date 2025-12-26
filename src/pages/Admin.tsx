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

// 🔒 REPLACE WITH YOUR EMAIL
const ADMIN_EMAIL = "ahmedallam111312@gmail.com";

const Admin = () => {
  // CRASH FIX: Default everything to empty objects/arrays
  const inventory = useInventory() || {};
  const products = inventory.products || [];
  const auditLogs = inventory.auditLogs || [];
  const { fetchProducts, clearAllData, addProduct } = inventory;

  const { user } = useAuth();
  const [isImporting, setIsImporting] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isAdmin = user?.email === ADMIN_EMAIL;

  // --- STATS CALCULATION (SAFE MODE) ---
  const stats = useMemo(() => {
    // Ensure products is an array before reducing
    const safeList = Array.isArray(products) ? products : [];

    const totalVal = safeList.reduce((sum, p) => {
      const price = Number(p.price) || 0;
      const qty = Number(p.quantity) || 0;
      return sum + (price * qty);
    }, 0);

    const lowStock = safeList.filter(p => (Number(p.quantity) || 0) <= (p.reorderPoint || 10)).length;

    return { totalVal, lowStock, count: safeList.length };
  }, [products]);

  const recentActivity = Array.isArray(auditLogs) ? auditLogs.slice(0, 10) : [];

  // --- ACTIONS ---
  const handleClearAll = async () => {
    if (!isAdmin) {
      toast.error("Permission Denied");
      return;
    }
    if (confirm("⚠️ Are you sure you want to DELETE ALL DATA? This cannot be undone.")) {
      setIsClearing(true);
      if (clearAllData) await clearAllData();
      setIsClearing(false);
    }
  };

  const handleImportClick = () => {
    if (!isAdmin) { toast.error("Access Denied"); return; }
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

        toast.info(`Processing ${jsonData.length} rows...`);
        let successCount = 0;

        for (const row of jsonData as any[]) {
          const getVal = (k: string) => {
            const found = Object.keys(row).find(key => key.toLowerCase().includes(k));
            return found ? row[found] : undefined;
          };

          const sku = getVal('sku');
          const name = getVal('name') || getVal('product');

          if (sku && name && addProduct) {
            // Only add if it doesn't exist locally
            const exists = products.find((p: any) => p.sku === String(sku));
            if (!exists) {
              await addProduct({
                sku: String(sku),
                name: String(name),
                price: Number(getVal('price')) || 0,
                quantity: Number(getVal('qty')) || Number(getVal('quantity')) || 0,
                category: 'Imported',
                reorderPoint: 10
              });
              successCount++;
            }
          }
        }
        toast.success(`Imported ${successCount} products.`);
        if (fetchProducts) fetchProducts();
      } catch (err) {
        toast.error("Import failed");
      } finally {
        setIsImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const exportInventoryReport = () => {
    try {
      const data = products.map((p: any) => ({
        'Product': p.name,
        'SKU': p.sku,
        'Price': p.price,
        'Quantity': p.quantity,
        'Total Value': (p.price || 0) * (p.quantity || 0)
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Inventory');
      XLSX.writeFile(wb, 'inventory_report.xlsx');
      toast.success("Export successful");
    } catch (e) { toast.error("Export failed"); }
  };

  const getActionColor = (action: string) => {
    if (action === 'SCAN_IN') return 'bg-green-100 text-green-800';
    if (action === 'SCAN_OUT') return 'bg-orange-100 text-orange-800';
    return 'bg-slate-100 text-slate-800';
  };

  return (
    <DashboardLayout>
      <div className="space-y-6" dir="rtl">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold flex gap-2 items-center">
            <ShieldCheck className="text-blue-600" /> لوحة التحكم
          </h1>
          <Badge variant="outline" className="text-blue-600">{user?.email}</Badge>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>إدارة البيانات</CardTitle>
          </CardHeader>
          <CardContent className="flex gap-2 flex-wrap">
            <input type="file" ref={fileInputRef} onChange={processImport} className="hidden" accept=".xlsx,.csv" />
            <Button onClick={handleImportClick} disabled={isImporting} className="bg-blue-600">
              {isImporting ? <Loader2 className="animate-spin" /> : <Upload className="w-4 h-4 ml-2" />} استيراد
            </Button>
            <Button onClick={exportInventoryReport} variant="outline"><Download className="w-4 h-4 ml-2" /> تصدير</Button>
            <div className="mr-auto">
              <Button onClick={handleClearAll} variant="destructive" disabled={isClearing}>
                {isClearing ? <Loader2 className="animate-spin" /> : <Trash2 className="w-4 h-4 ml-2" />} حذف الكل
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">القيمة الإجمالية</CardTitle></CardHeader>
            <CardContent><div className="text-3xl font-bold text-green-600">{stats.totalVal.toLocaleString()} ج.م</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">نواقص</CardTitle></CardHeader>
            <CardContent><div className="text-3xl font-bold text-orange-600">{stats.lowStock}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">المنتجات</CardTitle></CardHeader>
            <CardContent><div className="text-3xl font-bold text-blue-600">{stats.count}</div></CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle>النشاطات الأخيرة</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">الوقت</TableHead>
                  <TableHead className="text-right">المستخدم</TableHead>
                  <TableHead className="text-right">الحدث</TableHead>
                  <TableHead className="text-right">التفاصيل</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentActivity.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-8">لا يوجد نشاطات</TableCell></TableRow>
                ) : (
                  recentActivity.map((log: any) => (
                    <TableRow key={log.id}>
                      <TableCell dir="ltr" className="text-right">{new Date(log.created_at).toLocaleString('ar-EG')}</TableCell>
                      <TableCell>{log.user_email}</TableCell>
                      <TableCell><Badge className={getActionColor(log.action)}>{log.action}</Badge></TableCell>
                      <TableCell className="text-sm text-slate-500">
                        {log.details?.name || 'منتج'}
                        {log.details?.added ? ` (+${log.details.added})` : ''}
                        {log.details?.removed ? ` (-${log.details.removed})` : ''}
                      </TableCell>
                    </TableRow>
                  ))
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