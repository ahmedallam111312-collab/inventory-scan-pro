import React, { useState } from 'react';
import { useInventory } from '@/contexts/InventoryContext';
import DashboardLayout from '@/components/layout/DashboardLayout';
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
import { toast } from 'sonner';
import { Package, Plus, Pencil, Trash2, Loader2 } from 'lucide-react';
import { Product } from '@/types/database';

const Products = () => {
  // Fix 1: Default products to empty array to prevent "undefined" crash
  const { products = [], addProduct, updateProduct, deleteProduct, getTotalStock } = useInventory();

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [sku, setSku] = useState('');
  const [quantity, setQuantity] = useState(''); // Changed from Barcodes to Quantity
  const [imageUrl, setImageUrl] = useState('');

  const resetForm = () => {
    setName('');
    setPrice('');
    setSku('');
    setQuantity('');
    setImageUrl('');
    setEditingProduct(null);
  };

  const openEditDialog = (product: Product) => {
    setEditingProduct(product);
    setName(product.name || '');
    setPrice(product.price?.toString() || '');
    setSku(product.sku || '');
    // Check if quantity exists directly, otherwise fallback
    setQuantity(product.quantity?.toString() || '0');
    setImageUrl(product.image_url || '');
    setIsAddDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !price || !sku) {
      toast.error('Please fill in all required fields');
      return;
    }

    setIsSubmitting(true);
    try {
      // Fix 2: Align object with your actual Database Columns
      const productData = {
        name,
        price: parseFloat(price),
        sku,
        quantity: parseInt(quantity) || 0, // Save to the new quantity column
        image_url: imageUrl || null,
      };

      if (editingProduct) {
        await updateProduct(editingProduct.id, productData);
        toast.success('Product updated');
      } else {
        await addProduct(productData);
        toast.success('Product added');
      }

      setIsAddDialogOpen(false);
      resetForm();
    } catch (error) {
      console.error(error);
      toast.error('Failed to save product');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this product?')) {
      await deleteProduct(id);
      toast.success('Product deleted');
    }
  };

  // Safe Access Helper
  const safeProducts = products || [];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold font-heading">Products</h1>
            <p className="text-muted-foreground mt-1">
              Manage your product catalog
            </p>
          </div>

          <Dialog open={isAddDialogOpen} onOpenChange={(open) => {
            setIsAddDialogOpen(open);
            if (!open) resetForm();
          }}>
            <DialogTrigger asChild>
              <Button className="gradient-primary">
                <Plus className="w-4 h-4 mr-2" />
                Add Product
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editingProduct ? 'Edit Product' : 'Add New Product'}
                </DialogTitle>
                <DialogDescription>
                  {editingProduct ? 'Update product details' : 'Add a new product to your inventory'}
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name *</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Product name"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="price">Price *</Label>
                    <Input
                      id="price"
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
                    <Label htmlFor="sku">SKU *</Label>
                    <Input
                      id="sku"
                      value={sku}
                      onChange={(e) => setSku(e.target.value)}
                      placeholder="SKU-001"
                      required
                    />
                  </div>
                </div>

                {/* Changed Barcodes to Quantity to match your DB */}
                <div className="space-y-2">
                  <Label htmlFor="quantity">Initial Quantity</Label>
                  <Input
                    id="quantity"
                    type="number"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    placeholder="0"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="imageUrl">Image URL</Label>
                  <Input
                    id="imageUrl"
                    type="url"
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    placeholder="https://..."
                  />
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
                    Cancel
                  </Button>
                  <Button type="submit" className="flex-1" disabled={isSubmitting}>
                    {isSubmitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                    {editingProduct ? 'Update' : 'Add'} Product
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Products Table */}
        <Card className="border-border/50">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Stock</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* Fix 3: Handle loading/empty states safely */}
                {!safeProducts || safeProducts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                      <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      No products found.
                    </TableCell>
                  </TableRow>
                ) : (
                  safeProducts.map((product) => (
                    <TableRow key={product.id || Math.random()}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          {product.image_url ? (
                            <img
                              src={product.image_url}
                              alt={product.name}
                              className="w-10 h-10 rounded-lg object-cover"
                              onError={(e) => {
                                // Fallback if image link is broken
                                (e.target as HTMLImageElement).src = 'https://via.placeholder.com/40';
                              }}
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                              <Package className="w-5 h-5 text-muted-foreground" />
                            </div>
                          )}
                          <div>
                            <p className="font-medium">{product.name || 'Unnamed Product'}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <code className="text-sm bg-muted px-2 py-1 rounded">
                          {product.sku || 'No SKU'}
                        </code>
                      </TableCell>
                      <TableCell>${Number(product.price || 0).toFixed(2)}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {/* Prefer direct quantity, fallback to calculated stock */}
                          {product.quantity ?? getTotalStock(product.id) ?? 0} units
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEditDialog(product)}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive"
                            onClick={() => handleDelete(product.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
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

export default Products;