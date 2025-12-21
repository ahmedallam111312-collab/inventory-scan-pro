import React, { useState, useMemo, useEffect } from 'react';
import { useInventory } from '@/contexts/InventoryContext';
import DashboardLayout from '@/components/layout/DashboardLayout'; // FIXED: Added Sidebar Layout
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Package, Plus, Pencil, Trash2, Loader2, Search,
  TrendingUp, TrendingDown, AlertTriangle, FileDown,
  Grid, List, Copy, RefreshCw, DollarSign, Box
} from 'lucide-react';
import { toast } from 'sonner';

const Products = () => {
  // FIXED: Added 'fetchProducts' to auto-refresh data
  const { products, addProduct, updateProduct, deleteProduct, fetchProducts } = useInventory();

  // FIXED: Force refresh data when page loads to sync with Scanner
  useEffect(() => {
    if (fetchProducts) fetchProducts();
  }, []);

  // State management
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
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

  // Filtered and sorted products
  const filteredProducts = useMemo(() => {
    let filtered = (products || []).filter(product => {
      const matchesSearch = !searchTerm ||
        product.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.sku?.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesCategory = filterCategory === 'all' || product.category === filterCategory;

      return matchesSearch && matchesCategory;
    });

    // Sorting
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

      if (sortOrder === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });

    return filtered;
  }, [products, searchTerm, filterCategory, sortBy, sortOrder]);

  const resetForm = () => {
    setName('');
    setPrice('');
    setSku('');
    setQuantity('');
    setImageUrl('');
    setCategory('');
    setReorderPoint('');
    setCost('');
    setSupplier('');
    setEditingProduct(null);
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
    if (!name || !price || !sku) {
      toast.error('يرجى ملء جميع الحقول المطلوبة');
      return;
    }

    setIsSubmitting(true);
    try {
      const productData = {
        name,
        price: parseFloat(price),
        sku,
        quantity: parseInt(quantity) || 0,
        image_url: imageUrl || null,
        category: category || 'عام',
        reorderPoint: parseInt(reorderPoint) || 10,
        cost: parseFloat(cost) || 0,
        supplier: supplier || ''
      };

      if (editingProduct) {
        await updateProduct(editingProduct.id, productData);
        toast.success('تم تحديث المنتج بنجاح');
      } else {
        await addProduct(productData);
        toast.success('تم إضافة المنتج بنجاح');
      }

      setIsAddDialogOpen(false);
      resetForm();
      // FIXED: Refresh data after edit
      if (fetchProducts) fetchProducts();
    } catch (error) {
      console.error('Failed to save product:', error);
      toast.error('حدث خطأ أثناء الحفظ');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('هل أنت متأكد من حذف هذا المنتج؟')) {
      await deleteProduct(id);
      toast.success('تم حذف المنتج');
      // FIXED: Refresh data after delete
      if (fetchProducts) fetchProducts();
    }
  };

  const duplicateProduct = async (product: any) => {
    const duplicated = {
      ...product,
      name: `${product.name} (نسخة)`,
      sku: `${product.sku}-COPY-${Math.floor(Math.random() * 1000)}`,
      id: undefined
    };
    delete duplicated.id;
    await addProduct(duplicated);
    toast.success('تم نسخ المنتج');
    // FIXED: Refresh data after duplicate
    if (fetchProducts) fetchProducts();
  };

  const exportToCSV = () => {
    const csv = [
      ['الاسم', 'SKU', 'السعر', 'الكمية', 'التصنيف', 'المورد', 'التكلفة', 'الإجمالي'],
      ...filteredProducts.map(p => [
        p.name,
        p.sku,
        p.price,
        p.quantity,
        p.category || '',
        p.supplier || '',
        p.cost || 0,
        (p.price || 0) * (p.quantity || 0)
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `products-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getStockStatus = (product: any) => {
    const qty = product.quantity || 0;
    const point = product.reorderPoint || 10;

    if (qty === 0) return { label: 'نفذت الكمية', variant: 'destructive', color: 'bg-red-100 text-red-700 hover:bg-red-100' };
    if (qty <= point) return { label: 'مخزون منخفض', variant: 'secondary', color: 'bg-orange-100 text-orange-700 hover:bg-orange-100' };
    return { label: 'متوفر', variant: 'default', color: 'bg-green-100 text-green-700 hover:bg-green-100' };
  };

  return (
    // FIXED: Wrapped in DashboardLayout to show sidebar
    <DashboardLayout>
      <div className="space-y-6" dir="rtl">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">إدارة المنتجات</h1>
            <p className="text-slate-500 mt-1">
              عرض {filteredProducts.length} منتج
            </p>
          </div>

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
                <DialogTitle>
                  {editingProduct ? 'تعديل المنتج' : 'إضافة منتج جديد'}
                </DialogTitle>
                <DialogDescription>
                  {editingProduct ? 'تعديل بيانات المنتج الحالي' : 'أدخل بيانات المنتج الجديد لإضافته للمخزون'}
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 space-y-2">
                    <Label>اسم المنتج *</Label>
                    <Input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="مثال: آيفون 15 برو"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>SKU (الرمز) *</Label>
                    <Input
                      value={sku}
                      onChange={(e) => setSku(e.target.value)}
                      placeholder="APL-123"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>التصنيف</Label>
                    <Input
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      placeholder="إلكترونيات"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>سعر البيع *</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      placeholder="0.00"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>سعر التكلفة</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={cost}
                      onChange={(e) => setCost(e.target.value)}
                      placeholder="0.00"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>الكمية الحالية</Label>
                    <Input
                      type="number"
                      min="0"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      placeholder="0"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>حد الطلب (Reorder Point)</Label>
                    <Input
                      type="number"
                      min="0"
                      value={reorderPoint}
                      onChange={(e) => setReorderPoint(e.target.value)}
                      placeholder="10"
                    />
                  </div>

                  <div className="col-span-2 space-y-2">
                    <Label>المورد</Label>
                    <Input
                      value={supplier}
                      onChange={(e) => setSupplier(e.target.value)}
                      placeholder="اسم المورد"
                    />
                  </div>

                  <div className="col-span-2 space-y-2">
                    <Label>رابط الصورة</Label>
                    <Input
                      type="url"
                      value={imageUrl}
                      onChange={(e) => setImageUrl(e.target.value)}
                      placeholder="https://..."
                      dir="ltr"
                      className="text-right"
                    />
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      setIsAddDialogOpen(false);
                      resetForm();
                    }}
                  >
                    إلغاء
                  </Button>
                  <Button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700" disabled={isSubmitting}>
                    {isSubmitting && <Loader2 className="w-4 h-4 animate-spin ml-2" />}
                    {editingProduct ? 'حفظ التعديلات' : 'إضافة المنتج'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
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
              <p className="text-sm font-medium text-slate-600">القيمة الإجمالية</p>
              <p className="text-2xl font-bold text-green-700">{stats.totalValue.toLocaleString()} ج.م</p>
            </div>
            <DollarSign className="w-8 h-8 text-green-600 opacity-50" />
          </div>

          <div className="bg-orange-50 p-4 rounded-xl border border-orange-100 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-600">نواقص المخزون</p>
              <p className="text-2xl font-bold text-orange-700">{stats.lowStock}</p>
            </div>
            <AlertTriangle className="w-8 h-8 text-orange-600 opacity-50" />
          </div>
        </div>

        {/* Search and Filters */}
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="p-4">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <Input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="بحث بالاسم أو الكود..."
                  className="pr-10"
                />
              </div>

              <div className="flex gap-2 overflow-x-auto pb-1">
                {/* Category Filter */}
                <select
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                  className="px-3 py-2 border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">كل التصنيفات</option>
                  {categories.filter(c => c !== 'all').map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>

                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="px-3 py-2 border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="name">الاسم</option>
                  <option value="price">السعر</option>
                  <option value="quantity">الكمية</option>
                  <option value="sku">SKU</option>
                </select>

                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                >
                  {sortOrder === 'asc' ? (
                    <TrendingUp className="w-4 h-4" />
                  ) : (
                    <TrendingDown className="w-4 h-4" />
                  )}
                </Button>

                <div className="flex border rounded-lg overflow-hidden bg-white shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setViewMode('table')}
                    className={`rounded-none ${viewMode === 'table' ? 'bg-slate-100 text-blue-600' : ''}`}
                  >
                    <List className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setViewMode('grid')}
                    className={`rounded-none ${viewMode === 'grid' ? 'bg-slate-100 text-blue-600' : ''}`}
                  >
                    <Grid className="w-4 h-4" />
                  </Button>
                </div>

                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => { if (fetchProducts) fetchProducts() }}
                  title="تحديث البيانات"
                >
                  <RefreshCw className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Products Display */}
        {viewMode === 'table' ? (
          <Card className="border-slate-200 shadow-sm overflow-hidden">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead className="text-right">المنتج</TableHead>
                    <TableHead className="text-right">SKU</TableHead>
                    <TableHead className="text-right">التصنيف</TableHead>
                    <TableHead className="text-right">السعر</TableHead>
                    <TableHead className="text-right">الكمية</TableHead>
                    <TableHead className="text-right">الحالة</TableHead>
                    <TableHead className="text-right">القيمة</TableHead>
                    <TableHead className="text-left">إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProducts.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-12 text-slate-500">
                        <div className="flex flex-col items-center justify-center">
                          <Package className="w-12 h-12 mb-4 opacity-20" />
                          <p>لا توجد منتجات مطابقة للبحث</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredProducts.map((product) => {
                      const status = getStockStatus(product);

                      return (
                        <TableRow key={product.id} className="hover:bg-slate-50 transition-colors">
                          <TableCell>
                            <div className="flex items-center gap-3">
                              {product.image_url ? (
                                <img
                                  src={product.image_url}
                                  alt={product.name}
                                  className="w-10 h-10 rounded-lg object-cover border border-slate-200"
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).src = 'https://via.placeholder.com/40';
                                  }}
                                />
                              ) : (
                                <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center border border-slate-200">
                                  <Package className="w-5 h-5 text-slate-400" />
                                </div>
                              )}
                              <div>
                                <p className="font-medium text-slate-900">{product.name || 'بدون اسم'}</p>
                                {product.supplier && (
                                  <p className="text-xs text-slate-500">{product.supplier}</p>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <code className="text-xs bg-slate-100 px-2 py-1 rounded font-mono text-slate-600">
                              {product.sku || '-'}
                            </code>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="font-normal">{product.category || 'عام'}</Badge>
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="font-semibold text-slate-700">{Number(product.price || 0).toLocaleString()} ج.م</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <span className="font-medium">{product.quantity ?? 0}</span>
                              <span className="text-xs text-slate-500">وحدة</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge className={`${status.color} border-0`}>
                              {status.label}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium text-slate-700">
                                {((product.price || 0) * (product.quantity || 0)).toLocaleString()} ج.م
                              </p>
                            </div>
                          </TableCell>
                          <TableCell className="text-left">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openEditDialog(product)}
                                className="hover:text-blue-600"
                              >
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => duplicateProduct(product)}
                                className="hover:text-purple-600"
                              >
                                <Copy className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                onClick={() => handleDelete(product.id)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredProducts.length === 0 ? (
              <div className="col-span-full text-center py-12 text-slate-500 bg-white rounded-xl border border-dashed border-slate-300">
                <Package className="w-12 h-12 mx-auto mb-4 opacity-30" />
                <p>لا توجد منتجات للعرض</p>
              </div>
            ) : (
              filteredProducts.map(product => {
                const status = getStockStatus(product);
                return (
                  <Card key={product.id} className="hover:shadow-md transition-shadow group overflow-hidden">
                    <div className="relative aspect-video bg-slate-100">
                      {product.image_url ? (
                        <img
                          src={product.image_url}
                          alt={product.name}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = 'https://via.placeholder.com/300x200?text=No+Image';
                          }}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Package className="w-12 h-12 text-slate-300" />
                        </div>
                      )}
                      <div className="absolute top-2 right-2">
                        <Badge className={`${status.color} border-0 shadow-sm`}>
                          {status.label}
                        </Badge>
                      </div>
                    </div>

                    <CardContent className="p-4">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <h3 className="font-bold text-slate-900 line-clamp-1">{product.name}</h3>
                          <p className="text-xs text-slate-500 font-mono mt-1">{product.sku}</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 my-4 text-sm">
                        <div className="bg-slate-50 p-2 rounded text-center">
                          <span className="block text-xs text-slate-500 mb-1">السعر</span>
                          <span className="font-bold text-blue-600">{Number(product.price).toLocaleString()}</span>
                        </div>
                        <div className="bg-slate-50 p-2 rounded text-center">
                          <span className="block text-xs text-slate-500 mb-1">المخزون</span>
                          <span className="font-bold text-slate-700">{product.quantity}</span>
                        </div>
                      </div>

                      <div className="flex gap-2 pt-2 border-t mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="outline" size="sm" className="flex-1" onClick={() => openEditDialog(product)}>
                          <Pencil className="w-4 h-4 ml-2" />
                          تعديل
                        </Button>
                        <Button variant="outline" size="icon" className="text-red-500 hover:text-red-700" onClick={() => handleDelete(product.id)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default Products;