import React, { useState } from 'react';
import { useInventory } from '@/contexts/InventoryContext';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
import { Boxes, Plus, Pencil, Trash2, Loader2, AlertTriangle } from 'lucide-react';
import { format, isPast, isWithinInterval, addDays } from 'date-fns';
import { Batch } from '@/types/database';

const Batches = () => {
  const { products, batches, addBatch, updateBatch, deleteBatch } = useInventory();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingBatch, setEditingBatch] = useState<Batch | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [batchCode, setBatchCode] = useState('');

  const resetForm = () => {
    setProductId('');
    setQuantity('');
    setExpiryDate('');
    setBatchCode('');
    setEditingBatch(null);
  };

  const openEditDialog = (batch: Batch) => {
    setEditingBatch(batch);
    setProductId(batch.product_id);
    setQuantity(batch.quantity.toString());
    setExpiryDate(batch.expiry_date);
    setBatchCode(batch.batch_code);
    setIsAddDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productId || !quantity || !expiryDate || !batchCode) {
      toast.error('Please fill in all fields');
      return;
    }

    setIsSubmitting(true);
    try {
      const batchData = {
        product_id: productId,
        quantity: parseInt(quantity),
        expiry_date: expiryDate,
        batch_code: batchCode,
      };

      if (editingBatch) {
        await updateBatch(editingBatch.id, batchData);
        toast.success('Batch updated');
      } else {
        await addBatch(batchData);
        toast.success('Batch added');
      }

      setIsAddDialogOpen(false);
      resetForm();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this batch?')) {
      await deleteBatch(id);
      toast.success('Batch deleted');
    }
  };

  const getExpiryStatus = (expiryDate: string) => {
    const date = new Date(expiryDate);
    const now = new Date();
    
    if (isPast(date)) {
      return { status: 'expired', label: 'Expired', className: 'bg-destructive text-destructive-foreground' };
    }
    if (isWithinInterval(date, { start: now, end: addDays(now, 7) })) {
      return { status: 'warning', label: 'Expiring Soon', className: 'bg-warning text-warning-foreground' };
    }
    return { status: 'ok', label: 'OK', className: 'bg-success text-success-foreground' };
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold font-heading">Batches</h1>
            <p className="text-muted-foreground mt-1">
              Track batch quantities and expiry dates
            </p>
          </div>

          <Dialog open={isAddDialogOpen} onOpenChange={(open) => {
            setIsAddDialogOpen(open);
            if (!open) resetForm();
          }}>
            <DialogTrigger asChild>
              <Button className="gradient-primary">
                <Plus className="w-4 h-4 mr-2" />
                Add Batch
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editingBatch ? 'Edit Batch' : 'Add New Batch'}
                </DialogTitle>
                <DialogDescription>
                  {editingBatch ? 'Update batch details' : 'Add a new batch to track'}
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label>Product *</Label>
                  <Select value={productId} onValueChange={setProductId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a product" />
                    </SelectTrigger>
                    <SelectContent>
                      {products.map(product => (
                        <SelectItem key={product.id} value={product.id}>
                          {product.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="quantity">Quantity *</Label>
                    <Input
                      id="quantity"
                      type="number"
                      min="0"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      placeholder="0"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="batchCode">Batch Code *</Label>
                    <Input
                      id="batchCode"
                      value={batchCode}
                      onChange={(e) => setBatchCode(e.target.value)}
                      placeholder="BATCH-001"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="expiryDate">Expiry Date *</Label>
                  <Input
                    id="expiryDate"
                    type="date"
                    value={expiryDate}
                    onChange={(e) => setExpiryDate(e.target.value)}
                    required
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
                    {editingBatch ? 'Update' : 'Add'} Batch
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Batches Table */}
        <Card className="border-border/50">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Batch Code</TableHead>
                  <TableHead>Quantity</TableHead>
                  <TableHead>Expiry Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                      <Boxes className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      No batches yet. Add your first batch!
                    </TableCell>
                  </TableRow>
                ) : (
                  batches.map(batch => {
                    const product = products.find(p => p.id === batch.product_id);
                    const expiryStatus = getExpiryStatus(batch.expiry_date);
                    
                    return (
                      <TableRow key={batch.id}>
                        <TableCell>
                          <div className="font-medium">{product?.name || 'Unknown'}</div>
                          <div className="text-xs text-muted-foreground">{product?.sku}</div>
                        </TableCell>
                        <TableCell>
                          <code className="text-sm bg-muted px-2 py-1 rounded">
                            {batch.batch_code}
                          </code>
                        </TableCell>
                        <TableCell>
                          <span className="font-mono font-medium">{batch.quantity}</span>
                        </TableCell>
                        <TableCell>
                          {format(new Date(batch.expiry_date), 'MMM d, yyyy')}
                        </TableCell>
                        <TableCell>
                          <Badge className={expiryStatus.className}>
                            {expiryStatus.status === 'warning' && (
                              <AlertTriangle className="w-3 h-3 mr-1" />
                            )}
                            {expiryStatus.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEditDialog(batch)}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive hover:text-destructive"
                              onClick={() => handleDelete(batch.id)}
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
      </div>
    </DashboardLayout>
  );
};

export default Batches;
