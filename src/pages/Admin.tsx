import React, { useRef, useState } from 'react';
import { useInventory } from '@/contexts/InventoryContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client'; // Direct Supabase for Bulk Speed
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
  Loader2
} from 'lucide-react';
import { format, isWithinInterval, addDays } from 'date-fns';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';

// 🔒 CHANGE THIS TO YOUR EMAIL
const ADMIN_EMAIL = "ahmedallam111312@gmail.com";

const Admin = () => {
  const { products, batches, auditLogs, refreshData } = useInventory();
  const { user } = useAuth();
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 🔒 Security Check
  const isAdmin = user?.email === ADMIN_EMAIL;

  // Stats Logic
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

  const handleImportClick = () => {
    if (!isAdmin) {
      toast.error("Access Denied", { description: "Only the Admin account can import inventory." });
      return;
    }
    fileInputRef.current?.click();
  };

  // 🚀 OPTIMIZED BULK IMPORT (Fixes Infinite Loading)
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

        console.log(`📂 Processing ${jsonData.length} rows...`);
        toast.info("Starting Bulk Import", { description: `Processing ${jsonData.length} items. Please wait...` });

        // 1. Prepare Data Arrays
        const productsToUpsert: any[] = [];
        const excelBatches: any[] = [];

        // Helper to find case-insensitive keys
        const getValue = (row: any, key: string) => {
          const foundKey = Object.keys(row).find(k => k.toLowerCase() === key.toLowerCase());
          return foundKey ? row[foundKey] : undefined;
        };

        // 2. Build Product List
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

            // Keep track of batch data needed for this SKU
            const quantity = getValue(row, 'quantity') || getValue(row, 'qty');
            const expiry = getValue(row, 'expiry') || getValue(row, 'date');

            if (Number(quantity) > 0) {
              excelBatches.push({
                sku: String(sku), // Temporary link
                quantity: Number(quantity),
                expiry_date: expiry ? new Date(expiry).toISOString() : new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString(),
                batch_code: `IMP-${format(new Date(), 'yyyyMMdd')}`
              });
            }
          }
        }

        // 3. BULK UPSERT PRODUCTS (One massive request)
        // This creates new products AND updates existing ones, returning their IDs
        const { data: upsertedProducts, error: productError } = await supabase
          .from('products')
          .upsert(productsToUpsert, { onConflict: 'sku' })
          .select('id, sku');

        if (productError) throw productError;
        if (!upsertedProducts) throw new Error("No products returned from database");

        // 4. Create SKU -> ID Map
        const skuToIdMap = new Map(upsertedProducts.map(p => [p.sku, p.id]));

        // 5. Prepare Batches with correct IDs
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

        // 6. BULK INSERT BATCHES (One massive request)
        if (batchesToInsert.length > 0) {
          const { error: batchError } = await supabase
            .from('batches')
            .insert(batchesToInsert);

          if (batchError) throw batchError;
        }

        // 7. Finish
        toast.success("Import Complete!", { description: `Successfully processed ${jsonData.length} rows.` });
        refreshData(); // Refresh the UI to show new stock

      } catch (error: any) {
        console.error("Import Error:", error);
        toast.error("Import Failed", { description: error.message || "Unknown error occurred" });
      } finally {
        setIsImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };

    reader.readAsArrayBuffer(file);
  };

  const exportInventoryReport = () => {
    // Basic export logic
    const data = products.map(product => {
      const productBatches = batches.filter(b => b.product_id === product.id);
      const totalQty = productBatches.reduce((sum, b) => sum + b.quantity, 0);
      return {
        'Product Name': product.name,
        'SKU': product.sku,
        'Price': product.price,
        'Total Qty': totalQty,
      };
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Inventory');
    XLSX.writeFile(wb, `inventory-report.xlsx`);
  };

  const getActionColor = (action: string) => {
    switch (action) {
      case 'SCAN_IN': return 'bg-green-100 text-green-700'; // Simplified colors
      case 'SCAN_OUT': return 'bg-yellow-100 text-yellow-700';
      case 'ADJUST': return 'bg-blue-100 text-blue-700';
      default: return 'bg-gray-100 text-gray-700';
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
            {/* ✅ FIXED DOM NESTING ERROR: Used div instead of p */}
            <div className="text-muted-foreground mt-1 flex items-center gap-2">
              <span>Logged in as:</span>
              <span className="font-mono text-primary">{user?.email}</span>
              {isAdmin && <Badge className="bg-primary">ADMIN</Badge>}
            </div>
          </div>
        </div>

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

        {/* Import / Export Card */}
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-primary" />
              Data Management
            </CardTitle>
            <CardDescription>Bulk import inventory or download reports.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-4">
            <input type="file" ref={fileInputRef} onChange={processImport} className="hidden" accept=".xlsx,.xls,.csv" />

            <Button
              onClick={handleImportClick}
              className={isAdmin ? "gradient-primary" : "opacity-50 cursor-not-allowed"}
              disabled={isImporting}
            >
              {isImporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
              {isImporting ? "Importing..." : "Import Excel"}
            </Button>

            <Button onClick={exportInventoryReport} variant="outline">
              <Download className="w-4 h-4 mr-2" />
              Export Report
            </Button>
          </CardContent>
        </Card>

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