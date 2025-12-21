import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useInventory } from '@/contexts/InventoryContext';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Package, Plus, Pencil, Trash2, Loader2, Search, Upload,
  TrendingUp, TrendingDown, AlertTriangle, FileDown,
  Grid, List, Copy, RefreshCw, DollarSign, Box
} from 'lucide-react';
import { toast } from 'sonner';

const Products = () => {
  const { products, addProduct, updateProduct, deleteProduct, fetchProducts } = useInventory();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Force refresh data on load
  useEffect(() => {
    if (fetchProducts) fetchProducts();
  }, []);

  // State management
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Form state
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [sku, setSku] = useState('');
  const [quantity, setQuantity] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [category, setCategory] = useState('');
  const [reorderPoint, setReorderPoint] = useState('');
  const [cost, setCost] = useState('');
  const [supplier, setSupplier] = useState('');

  // Statistics
  const stats = useMemo(() => {
    const safeProducts = products || [];
    const totalProducts = safeProducts.length;
    const totalValue = safeProducts.reduce((sum, p) => sum + ((p.price || 0) * (p.quantity || 0)), 0);
    const lowStock = safeProducts.filter(p => (p.quantity || 0) <= (p.reorderPoint || 10)).length;
    return { totalProducts, totalValue, lowStock };
  }, [products]);

  // Categories
  const categories = useMemo(() => {
    const cats = [...new Set((products || []).map(p => p.category).filter(Boolean))];
    return ['all', ...cats];
  }, [products]);

  // Filter & Sort
  const filteredProducts = useMemo(() => {
    let filtered = (products || []).filter(product => {
      const matchesSearch = !searchTerm ||
        product.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.sku?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = filterCategory === 'all' || product.category === filterCategory;
      return matchesSearch && matchesCategory;
    });

    filtered.sort((a: any, b: any) => {
      let aVal = a[sortBy];
      let bVal = b[sortBy];
      if (sortBy === 'name' || sortBy === 'sku') {
        aVal = (aVal || '').toLowerCase();
        bVal = (bVal || '').toLowerCase();
      } else {
        aVal = Number(aVal) || 0;
        bVal = Number(bVal) || 0;
      }
      return sortOrder === 'asc' ? (aVal > bVal ? 1 : -1) : (aVal < bVal ? 1 : -1);
    });
    return filtered;
  }, [products, searchTerm, filterCategory, sortBy, sortOrder]);

  // --- ACTIONS ---

  const resetForm = () => {
    setName(''); setPrice(''); setSku(''); setQuantity('');
    setImageUrl(''); setCategory(''); setReorderPoint('');
    setCost(''); setSupplier(''); setEditingProduct(null);
  };

  const openEditDialog = (product: any) => {
    setEditingProduct(product);
    setName(product.name || '');
    setPrice(product.price?.toString() || '');
    setSku(product.sku || '');
    setQuantity(product.quantity?.toString() || '0');
    setImageUrl(product.image_url || '');
    setCategory(product.category || '');
    setReorderPoint(product.reorderPoint?.toString() || '10');
    setCost(product.cost?.toString() || '');
    setSupplier(product.supplier || '');
    setIsAddDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !price || !sku) { toast.error('Required fields missing'); return; }

    setIsSubmitting(true);
    try {
      const productData = {
        name,
        price: parseFloat(price),
        sku,
        quantity: parseInt(quantity) || 0,
        image_url: imageUrl || null,
        category: category || 'General',
        reorderPoint: parseInt(reorderPoint) || 10,
        cost: parseFloat(cost) || 0,
        supplier: supplier || ''
      };

      if (editingProduct) {
        await updateProduct(editingProduct.id, productData);
        toast.success('Updated successfully');
      } else {
        await addProduct(productData);
        toast.success('Added successfully');
      }
      setIsAddDialogOpen(false);
      resetForm();
    } catch (error) {
      toast.error('Operation failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Delete this product?')) {
      await deleteProduct(id);
      toast.success('Deleted successfully');
    }
  };

  // --- NEW IMPORT LOGIC (Solves the "ID is null" error) ---
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      setIsImporting(true);
      try {
        const text = e.target?.result as string;
        // Split by new line, ignore empty lines
        const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');

        // Assume first row is headers
        // We look for column order based on standard CSV (sku, name, price...)
        // Or we just naively assume column indexes: SKU=0, Name=1, Price=2, Qty=3

        let successCount = 0;

        for (let i = 1; i < lines.length; i++) {
          const columns = lines[i].split(',');
          if (columns.length < 3) continue; // Skip bad rows

          // CLEAN THE DATA
          // Remove quotes if present
          const clean = (val: string) => val ? val.replace(/^"|"$/g, '').trim() : '';

          const pSku = clean(columns[0]);
          const pName = clean(columns[1]);
          const pPrice = parseFloat(clean(columns[2])) || 0;
          const pQty = parseInt(clean(columns[3])) || 0;

          if (!pSku || !pName) continue;

          // Skip existing products to avoid duplicates (optional, or update them)
          const exists = products.find(p => p.sku === pSku);
          if (!exists) {
            await addProduct({
              sku: pSku,
              name: pName,
              price: pPrice,
              quantity: pQty,
              category: 'Imported'
            });
            successCount++;
          }
        }
        toast.success(`Imported ${successCount} products successfully`);
        if (fetchProducts) fetchProducts();
      } catch (err) {
        console.error(err);
        toast.error('Import failed. Check CSV format.');
      } finally {
        setIsImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  // --- FIXED EXPORT LOGIC (Solves the "0 Quantity" error) ---
  const exportToCSV = () => {
    const csvContent = [
      ['Name', 'SKU', 'Price', 'Quantity', 'Category', 'Total Value'], // Header
      ...filteredProducts.map(p => [
        `"${p.name}"`, // Quote names to handle commas
        `"${p.sku}"`,
        p.price,
        Number(p.quantity || 0), // FORCE NUMBER FORMAT
        `"${p.category || ''}"`,
        (p.price || 0) * (p.quantity || 0)
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `inventory_export_${new Date().toLocaleDateString()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getStockStatus = (product: any) => {
    const qty = product.quantity || 0;
    const point = product.reorderPoint || 10;
    if (qty === 0) return { label: 'Out of Stock', variant: 'destructive', color: 'bg-red-100 text-red-700' };
    if (qty <= point) return { label: 'Low Stock', variant: 'secondary', color: 'bg-orange-100 text-orange-700' };
    return { label: 'In Stock', variant: 'default', color: 'bg-green-100 text-green-700' };
  };

  return (
    <DashboardLayout>
      <div className="space-y-6" dir="rtl">
        {/* Hidden File Input for Import */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileUpload}
          accept=".csv"
          className="hidden"
        />

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">إدارة المنتجات</h1>
            <p className="text-slate-500 mt-1">
              عرض {filteredProducts.length} منتج
            </p>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={isImporting}
            >
              {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4 ml-2" />}
              استيراد CSV
            </Button>

            <Dialog open={isAddDialogOpen} onOpenChange={(open) => {
              setIsAddDialogOpen(open);
              if (!open) resetForm();
            }}>
              <DialogTrigger asChild>
                <Button className="bg-blue-600 hover:bg-blue-700 gap-2 shadow-lg shadow-blue-200">
                  <Plus className="w-4 h-4" />
                  منتج جديد
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
                <DialogHeader>
                  <DialogTitle>{editingProduct ? 'تعديل المنتج' : 'إضافة منتج'}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                  {/* ... FORM INPUTS (Keep same as before) ... */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2 space-y-2">
                      <Label>اسم المنتج</Label>
                      <Input value={name} onChange={e => setName(e.target.value)} required />
                    </div>
                    <div className="space-y-2">
                      <Label>SKU</Label>
                      <Input value={sku} onChange={e => setSku(e.target.value)} required />
                    </div>
                    <div className="space-y-2">
                      <Label>التصنيف</Label>
                      <Input value={category} onChange={e => setCategory(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>السعر</Label>
                      <Input type="number" value={price} onChange={e => setPrice(e.target.value)} required />
                    </div>
                    <div className="space-y-2">
                      <Label>الكمية</Label>
                      <Input type="number" value={quantity} onChange={e => setQuantity(e.target.value)} />
                    </div>
                    <div className="col-span-2">
                      <Label>صورة</Label>
                      <Input value={imageUrl} onChange={e => setImageUrl(e.target.value)} dir="ltr" />
                    </div>
                  </div>

                  <div className="flex gap-3 pt-4">
                    <Button type="button" variant="outline" className="flex-1" onClick={() => setIsAddDialogOpen(false)}>إلغاء</Button>
                    <Button type="submit" className="flex-1 bg-blue-600" disabled={isSubmitting}>حفظ</Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-600">إجمالي المنتجات</p>
              <p className="text-2xl font-bold text-blue-700">{stats.totalProducts}</p>
            </div>
            <Box className="w-8 h-8 text-blue-600 opacity-50" />
          </div>
          <div className="bg-green-50 p-4 rounded-xl border border-green-100 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-600">القيمة</p>
              <p className="text-2xl font-bold text-green-700">{stats.totalValue.toLocaleString()} ج.م</p>
            </div>
            <DollarSign className="w-8 h-8 text-green-600 opacity-50" />
          </div>
          <div className="bg-orange-50 p-4 rounded-xl border border-orange-100 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-600">نواقص</p>
              <p className="text-2xl font-bold text-orange-700">{stats.lowStock}</p>
            </div>
            <AlertTriangle className="w-8 h-8 text-orange-600 opacity-50" />
          </div>
        </div>

        {/* Toolbar */}
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="p-4">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <Input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="بحث..." className="pr-10" />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={exportToCSV}>
                  <FileDown className="w-4 h-4 ml-2" />
                  تصدير
                </Button>
                <Button variant="outline" size="icon" onClick={() => { if (fetchProducts) fetchProducts() }}>
                  <RefreshCw className="w-4 h-4" />
                </Button>
                <div className="flex border rounded-lg overflow-hidden bg-white">
                  <Button variant="ghost" size="icon" onClick={() => setViewMode('table')} className={viewMode === 'table' ? 'bg-slate-100' : ''}>
                    <List className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setViewMode('grid')} className={viewMode === 'grid' ? 'bg-slate-100' : ''}>
                    <Grid className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Table View */}
        {viewMode === 'table' ? (
          <Card className="border-slate-200 shadow-sm overflow-hidden">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead className="text-right">المنتج</TableHead>
                    <TableHead className="text-right">SKU</TableHead>
                    <TableHead className="text-right">السعر</TableHead>
                    <TableHead className="text-right">الكمية</TableHead>
                    <TableHead className="text-right">الحالة</TableHead>
                    <TableHead className="text-left">إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProducts.map((product) => {
                    const status = getStockStatus(product);
                    return (
                      <TableRow key={product.id}>
                        <TableCell className="font-medium">{product.name}</TableCell>
                        <TableCell>
                          <code className="bg-slate-100 px-2 rounded">{product.sku}</code>
                        </TableCell>
                        <TableCell>{product.price} ج.م</TableCell>
                        <TableCell>{product.quantity}</TableCell>
                        <TableCell><Badge className={status.color}>{status.label}</Badge></TableCell>
                        <TableCell className="text-left">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openEditDialog(product)}><Pencil className="w-4 h-4" /></Button>
                            <Button variant="ghost" size="icon" className="text-red-500" onClick={() => handleDelete(product.id)}><Trash2 className="w-4 h-4" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ) : (
          /* Grid View */
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {filteredProducts.map(product => (
              <Card key={product.id}>
                <CardContent className="p-4">
                  <h3 className="font-bold">{product.name}</h3>
                  <p className="text-sm text-slate-500 mb-2">{product.sku}</p>
                  <div className="flex justify-between items-center bg-slate-50 p-2 rounded">
                    <span>{product.quantity} وحدة</span>
                    <span className="font-bold">{product.price} ج.م</span>
                  </div>
                  <div className="flex gap-2 mt-2">
                    <Button variant="outline" className="flex-1" onClick={() => openEditDialog(product)}>تعديل</Button>
                    <Button variant="ghost" className="text-red-500" onClick={() => handleDelete(product.id)}><Trash2 className="w-4 h-4" /></Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default Products;