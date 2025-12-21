import React, { useRef, useState } from 'react';
import { useInventory } from '@/contexts/InventoryContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ShieldCheck,
  Download,
  Upload,
  DollarSign,
  AlertTriangle,
  Activity,
  FileSpreadsheet,
  Loader2,
  Trash2
} from 'lucide-react';
import { format, isWithinInterval, addDays } from 'date-fns';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';

// 🔒 REPLACE THIS WITH YOUR REAL ADMIN EMAIL
const ADMIN_EMAIL = "ahmedallam111312@gmail.com";

const Admin = () => {
  const { products, batches, auditLogs, refreshData, clearAllData } = useInventory();
  const { user } = useAuth();
  const [isImporting, setIsImporting] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isAdmin = user?.email === ADMIN_EMAIL;

  // --- STATS ---
  const totalValue = products.reduce((sum, p) => {
    const productStock = batches
      .filter(b => b.product_id === p.id)
      .reduce((s, b) => s + b.quantity, 0);
    return sum + (productStock * p.price);
  }, 0);

  const now = new Date();
  const expiringBatches = batches.filter(batch => {
    const expiryDate = new Date(batch.expiry_date);
    return isWithinInterval(expiryDate, { start: now, end: addDays(now, 7) });
  });

  const recentActivity = auditLogs.slice(0, 10);

  // --- DELETE ALL DATA ---
  const handleClearAll = async () => {
    if (!isAdmin) {
      toast.error("Permission Denied", { description: "Only Admin can perform this action." });
      return;
    }

    if (
      window.confirm("⚠️ DANGER: Are you sure you want to delete ALL data?") &&
      window.confirm("This action cannot be undone. All products, batches, and logs will be lost forever. Proceed?")
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

        const productsToUpsert: any[] = [];
        const excelBatches: any[] = [];

        const getValue = (row: any, key: string) => {
          const foundKey = Object.keys(row).find(k => k.toLowerCase() === key.toLowerCase());
          return foundKey ? row[foundKey] : undefined;
        };

        for (const row of jsonData as any[]) {
          const sku = getValue(row, 'sku');
          const name = getValue(row, 'name') || getValue(row, 'product name');
          const price = getValue(row, 'price');

          if (sku && name) {
            productsToUpsert.push({
              sku: String(sku),
              name: String(name),
              price: Number(price) || 0,
              barcodes: [String(sku)],
              image_url: null,
              updated_at: new Date().toISOString()
            });

            const quantity = getValue(row, 'quantity') || getValue(row, 'qty');
            const expiry = getValue(row, 'expiry') || getValue(row, 'date');

            if (Number(quantity) > 0) {
              excelBatches.push({
                sku: String(sku),
                quantity: Number(quantity),
                expiry_date: expiry ? new Date(expiry).toISOString() : new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString(),
                batch_code: `IMP-${format(new Date(), 'yyyyMMdd')}`
              });
            }
          }
        }

        // Bulk Upsert Products
        const { data: upsertedProducts, error: productError } = await supabase
          .from('products')
          .upsert(productsToUpsert, { onConflict: 'sku' })
          .select('id, sku');

        if (productError) throw productError;
        if (!upsertedProducts) throw new Error("Database error");

        const skuToIdMap = new Map(upsertedProducts.map(p => [p.sku, p.id]));

        // Prepare Batches
        const batchesToInsert = excelBatches
          .map(b => {
            const pid = skuToIdMap.get(b.sku);
            if (!pid) return null;
            return {
              product_id: pid,
              quantity: b.quantity,
              expiry_date: b.expiry_date,
              batch_code: b.batch_code
            };
          })
          .filter(b => b !== null);

        if (batchesToInsert.length > 0) {
          const { error: batchError } = await supabase.from('batches').insert(batchesToInsert);
          if (batchError) throw batchError;
        }

        toast.success("Import Complete!", { description: `Processed ${jsonData.length} rows.` });
        refreshData();

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
      const data = products.map(product => {
        const productBatches = batches.filter(b => b.product_id === product.id);
        const totalQty = productBatches.reduce((sum, b) => sum + b.quantity, 0);
        return {
          'Product': product.name,
          'SKU': product.sku,
          'Price': product.price,
          'Total Qty': totalQty,
          'Value': totalQty * product.price,
        };
      });

      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Inventory');
      XLSX.writeFile(wb, `inventory-report-${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
      toast.success('Report exported');
    } catch (error) { toast.error('Failed to export'); }
  };

  const getActionColor = (action: string) => {
    switch (action) {
      case 'SCAN_IN': return 'bg-success/10 text-success';
      case 'SCAN_OUT': return 'bg-warning/10 text-warning';
      case 'ADJUST': return 'bg-primary/10 text-primary';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold font-heading flex items-center gap-3">
              <ShieldCheck className="w-8 h-8 text-primary" />
              Admin Panel
            </h1>
            <div className="text-muted-foreground mt-1 flex items-center gap-2">
              <span>User:</span>
              <span className="font-mono text-primary">{user?.email}</span>
              {isAdmin && <Badge className="bg-primary">ADMIN</Badge>}
            </div>
          </div>
        </div>

        {/* Action Buttons (Import / Export / Delete) */}
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-primary" />
              Data Management
            </CardTitle>
            <CardDescription>
              Manage system data, imports, and exports.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-4 items-center">
            {/* Import */}
            <input type="file" ref={fileInputRef} onChange={processImport} className="hidden" accept=".xlsx,.xls,.csv" />
            <Button
              onClick={handleImportClick}
              className={isAdmin ? "gradient-primary" : "opacity-50 cursor-not-allowed"}
              disabled={isImporting || isClearing}
            >
              {isImporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
              Import Excel
            </Button>

            {/* Export */}
            <Button onClick={exportInventoryReport} variant="outline" disabled={isImporting || isClearing}>
              <Download className="w-4 h-4 mr-2" />
              Export Report
            </Button>

            {/* DANGER: Clear Data */}
            <div className="ml-auto">
              <Button
                onClick={handleClearAll}
                variant="destructive"
                disabled={isClearing || isImporting || !isAdmin}
              >
                {isClearing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
                Delete All Data
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border-border/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Stock Value</CardTitle>
              <DollarSign className="w-4 h-4 text-primary" />
            </CardHeader>
            <CardContent><div className="text-3xl font-bold">${totalValue.toLocaleString()}</div></CardContent>
          </Card>

          <Card className={`border-border/50 ${expiringBatches.length > 0 ? 'ring-2 ring-warning/50' : ''}`}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Expiring Soon</CardTitle>
              <AlertTriangle className="w-4 h-4 text-yellow-500" />
            </CardHeader>
            <CardContent><div className="text-3xl font-bold">{expiringBatches.length}</div></CardContent>
          </Card>

          <Card className="border-border/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Recent Actions</CardTitle>
              <Activity className="w-4 h-4 text-primary" />
            </CardHeader>
            <CardContent><div className="text-3xl font-bold">{auditLogs.length}</div></CardContent>
          </Card>
        </div>

        {/* Activity Table */}
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Activity className="w-5 h-5 text-primary" /> Recent Activity</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentActivity.map(log => {
                  const details = log.details as any;
                  return (
                    <TableRow key={log.id}>
                      <TableCell className="font-mono text-sm">{format(new Date(log.created_at), 'MMM d, HH:mm')}</TableCell>
                      <TableCell className="text-sm">{log.user_email}</TableCell>
                      <TableCell><Badge className={getActionColor(log.action)}>{log.action}</Badge></TableCell>
                      <TableCell className="text-sm text-muted-foreground">{details?.product_name || 'Item'} ({details?.quantity_added || details?.quantity_removed || 0})</TableCell>
                    </TableRow>
                  );
                })
                }
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Admin;