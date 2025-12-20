import React, { useState, useEffect, useRef } from 'react';
import { useInventory } from '@/contexts/InventoryContext';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Scanner as QrScanner } from '@yudiel/react-qr-scanner';
import { Scan, Search, Minus, Plus, Camera, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

const Scanner = () => {
  const { products, batches, scanIn, scanOut, getProductByBarcode } = useInventory();
  const [barcode, setBarcode] = useState('');
  const [activeTab, setActiveTab] = useState<'in' | 'out'>('in');
  const [scannedProduct, setScannedProduct] = useState<any | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isCameraOpen && !scannedProduct) inputRef.current?.focus();
  }, [isCameraOpen, scannedProduct]);

  const handleSearch = (e: React.FormEvent) => { e.preventDefault(); findProduct(barcode); };

  const findProduct = (term: string) => {
    if (!term) return;
    const cleanTerm = term.trim().toLowerCase();
    let found = getProductByBarcode(term);
    if (!found) {
      found = products.find(p =>
        p.name.toLowerCase().includes(cleanTerm) ||
        p.sku.toLowerCase().includes(cleanTerm) ||
        p.barcodes.some(b => b.toLowerCase().includes(cleanTerm))
      );
    }
    if (found) {
      setScannedProduct(found);
      setBarcode('');
      setIsCameraOpen(false);
      toast.success("تم العثور على المنتج", { description: found.name });
    } else {
      toast.error("غير موجود", { description: `لا يوجد منتج يطابق "${term}"` });
      setBarcode('');
    }
  };

  const handleCameraScan = (detectedCodes: any[]) => {
    if (detectedCodes && detectedCodes.length > 0) findProduct(detectedCodes[0].rawValue);
  };

  const handleSubmit = async () => {
    if (!scannedProduct) return;
    const productBatches = batches.filter(b => b.product_id === scannedProduct.id);
    const targetBatch = productBatches.length > 0 ? productBatches[0] : null;

    if (!targetBatch) {
      toast.error("لا توجد دفعة", { description: "يجب تهيئة المخزون لهذا المنتج أولاً" });
      return;
    }

    try {
      if (activeTab === 'in') {
        await scanIn(scannedProduct.id, targetBatch.id, quantity);
        toast.success(`تمت إضافة ${quantity} للمخزون`);
      } else {
        await scanOut(scannedProduct.id, targetBatch.id, quantity);
        toast.success(`تم خصم ${quantity} من المخزون`);
      }
      resetScanner();
    } catch (error) { toast.error("حدث خطأ"); }
  };

  const resetScanner = () => {
    setScannedProduct(null);
    setQuantity(1);
    setBarcode('');
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <h1 className="text-3xl font-bold font-heading flex items-center gap-2">
            <Scan className="w-8 h-8 text-primary" />
            الماسح الضوئي
          </h1>
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'in' | 'out')} className="w-full md:w-auto">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="in" className="data-[state=active]:bg-green-100 data-[state=active]:text-green-700">إضافة (+)</TabsTrigger>
              <TabsTrigger value="out" className="data-[state=active]:bg-red-100 data-[state=active]:text-red-700">صرف (-)</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {isCameraOpen && (
          <Card className="overflow-hidden border-2 border-primary">
            <div className="relative aspect-video bg-black">
              <QrScanner onScan={handleCameraScan} onError={(e) => console.log(e)} containerStyle={{ width: '100%', height: '100%' }} />
              <p className="absolute bottom-4 w-full text-center text-white bg-black/50 py-2">وجه الكاميرا نحو الباركود</p>
            </div>
            <Button variant="destructive" className="w-full rounded-t-none" onClick={() => setIsCameraOpen(false)}>إغلاق الكاميرا</Button>
          </Card>
        )}

        {!scannedProduct && !isCameraOpen && (
          <Card>
            <CardContent className="pt-6">
              <form onSubmit={handleSearch} className="flex gap-2">
                <Input ref={inputRef} placeholder="امسح الباركود أو اكتب اسم المنتج..." value={barcode} onChange={(e) => setBarcode(e.target.value)} className="text-lg h-12" autoFocus />
                <Button type="submit" size="icon" className="h-12 w-12"><Search className="w-5 h-5" /></Button>
                <Button type="button" variant="outline" size="icon" className="h-12 w-12" onClick={() => setIsCameraOpen(true)}><Camera className="w-5 h-5" /></Button>
              </form>
            </CardContent>
          </Card>
        )}

        {scannedProduct && (
          <Card className="border-2 border-primary">
            <CardHeader className="pb-2">
              <div className="flex justify-between items-start">
                <div>
                  <Badge variant="outline" className="mb-2">{scannedProduct.sku}</Badge>
                  <CardTitle className="text-2xl">{scannedProduct.name}</CardTitle>
                </div>
                <Button variant="ghost" size="sm" onClick={resetScanner}>إلغاء</Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="bg-muted p-3 rounded-lg"><span className="text-muted-foreground block">السعر</span><span className="font-semibold text-lg">${scannedProduct.price}</span></div>
                <div className="bg-muted p-3 rounded-lg"><span className="text-muted-foreground block">المخزون الحالي</span><span className="font-semibold text-lg">{scannedProduct.totalStock || 'غير معروف'}</span></div>
              </div>
              <div className="flex items-center justify-center gap-6 py-4">
                <Button variant="outline" size="icon" className="h-14 w-14 rounded-full" onClick={() => setQuantity(q => Math.max(1, q - 1))}><Minus className="w-6 h-6" /></Button>
                <div className="text-center w-24"><div className="text-4xl font-bold">{quantity}</div><div className="text-xs text-muted-foreground">الكمية</div></div>
                <Button variant="outline" size="icon" className="h-14 w-14 rounded-full" onClick={() => setQuantity(q => q + 1)}><Plus className="w-6 h-6" /></Button>
              </div>
              <Button onClick={handleSubmit} className={`w-full h-14 text-lg gap-2 ${activeTab === 'in' ? 'bg-green-600' : 'bg-red-600'}`}>
                <CheckCircle2 className="w-6 h-6" />
                تأكيد {activeTab === 'in' ? 'الإضافة' : 'الصرف'}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
};
export default Scanner;