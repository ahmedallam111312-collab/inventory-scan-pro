import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useInventory } from '@/contexts/InventoryContext';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Scan, Search, Minus, Plus, Camera, CheckCircle2,
  History, TrendingUp, Package, AlertTriangle,
  Download, Zap, Clock, BarChart3, X, ChevronLeft, Loader2
} from 'lucide-react';
import { toast } from 'sonner';
// Import the camera library
import { QrReader } from 'react-qr-reader';

const Scanner = () => {
  const { products, updateProduct, scanIn, scanOut } = useInventory();

  // Core state
  const [barcode, setBarcode] = useState('');
  const [activeTab, setActiveTab] = useState('in');
  const [scannedProduct, setScannedProduct] = useState<any>(null);
  const [quantity, setQuantity] = useState(1);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Advanced features state
  const [recentScans, setRecentScans] = useState<any[]>([]);
  const [scanHistory, setScanHistory] = useState<any[]>([]);
  const [continuousScan, setContinuousScan] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [showStats, setShowStats] = useState(false);
  const [quickActions, setQuickActions] = useState<any[]>([]);
  const [searchSuggestions, setSearchSuggestions] = useState<any[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  // 1. Initialize Audio
  useEffect(() => {
    try {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch (e) { console.error("Audio not supported"); }
    return () => { audioContextRef.current?.close(); };
  }, []);

  const playSound = useCallback((type: 'success' | 'error') => {
    if (!soundEnabled || !audioContextRef.current) return;
    try {
      const ctx = audioContextRef.current;
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      if (type === 'success') {
        oscillator.frequency.value = 800;
        oscillator.type = 'sine';
      } else {
        oscillator.frequency.value = 200;
        oscillator.type = 'square';
      }

      gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.2);
    } catch (e) { console.error(e); }
  }, [soundEnabled]);

  const vibrate = useCallback((pattern: number[]) => {
    if ('vibrate' in navigator) navigator.vibrate(pattern);
  }, []);

  // 2. Focus Management
  useEffect(() => {
    if (!isCameraOpen && !scannedProduct && !isProcessing) {
      inputRef.current?.focus();
    }
  }, [isCameraOpen, scannedProduct, isProcessing]);

  // 3. Load History
  useEffect(() => {
    const saved = localStorage.getItem('scan_history');
    if (saved) setScanHistory(JSON.parse(saved));
  }, []);

  // 4. Keyboard Shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case 'k': e.preventDefault(); inputRef.current?.focus(); break;
          case 'c': e.preventDefault(); setIsCameraOpen(true); break;
          case 'r': e.preventDefault(); resetScanner(); break;
        }
      }
      if (scannedProduct) {
        if (e.key === 'Enter' && !isProcessing) handleSubmit();
        else if (e.key === 'Escape') resetScanner();
      }
    };
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [scannedProduct, isProcessing]);

  // Search Logic
  const updateSearchSuggestions = useCallback((term: string) => {
    if (!term || term.length < 2) { setSearchSuggestions([]); return; }
    const cleanTerm = term.toLowerCase();
    const matches = products.filter(p =>
      (p.name && p.name.toLowerCase().includes(cleanTerm)) ||
      (p.sku && p.sku.toLowerCase().includes(cleanTerm))
    ).slice(0, 5);
    setSearchSuggestions(matches);
  }, [products]);

  const findProduct = useCallback((term: string) => {
    if (!term) return;
    const cleanTerm = term.trim().toLowerCase();

    // Find by SKU or Name
    const found = products.find(p =>
      p.sku.toLowerCase() === cleanTerm ||
      p.name.toLowerCase().includes(cleanTerm)
    );

    if (found) {
      setScannedProduct(found);
      setBarcode('');
      setIsCameraOpen(false); // Close camera immediately on find
      setSearchSuggestions([]);

      playSound('success');
      vibrate([50]);

      // Add to recent scans
      setRecentScans(prev => {
        const filtered = prev.filter(p => p.id !== found.id);
        return [found, ...filtered].slice(0, 5);
      });

      updateQuickActions(found);
      toast.success(`تم العثور على: ${found.name}`);
    } else {
      playSound('error');
      vibrate([100, 50, 100]);
      toast.error(`غير موجود: "${term}"`);
      setBarcode('');
    }
  }, [products, playSound, vibrate]);

  const updateQuickActions = useCallback((product: any) => {
    setQuickActions([
      { label: '+1', quantity: 1 },
      { label: '+5', quantity: 5 },
      { label: '+10', quantity: 10 },
      { label: '+50', quantity: 50 }
    ]);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    findProduct(barcode);
  };

  // --- CAMERA HANDLER ---
  const handleScan = (result: any, error: any) => {
    if (result) {
      const text = result?.text;
      if (text) findProduct(text);
    }
  };

  // Submit Transaction
  const handleSubmit = async () => {
    if (!scannedProduct || isProcessing) return;
    setIsProcessing(true);

    try {
      const operationName = activeTab === 'in' ? 'تمت الإضافة' : 'تم الصرف';

      if (activeTab === 'in') {
        await scanIn(scannedProduct.id, quantity);
      } else {
        await scanOut(scannedProduct.id, quantity);
      }

      // Log to local history
      const newEntry = {
        id: Date.now().toString(),
        product: scannedProduct,
        operation: activeTab,
        quantity,
        timestamp: new Date().toISOString(),
        user: 'المستخدم الحالي'
      };

      const updatedHistory = [newEntry, ...scanHistory].slice(0, 50);
      setScanHistory(updatedHistory);
      localStorage.setItem('scan_history', JSON.stringify(updatedHistory));

      playSound('success');
      vibrate([50, 100, 50]);
      toast.success(`${operationName} بنجاح`, { description: `${quantity} × ${scannedProduct.name}` });

      if (continuousScan) {
        setTimeout(() => {
          setScannedProduct(null);
          setQuantity(1);
        }, 1000);
      } else {
        resetScanner();
      }
    } catch (err: any) {
      playSound('error');
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  const resetScanner = useCallback(() => {
    setScannedProduct(null);
    setQuantity(1);
    setBarcode('');
    setSearchSuggestions([]);
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  const stats = {
    totalScans: scanHistory.length,
    todayScans: scanHistory.filter(s => new Date(s.timestamp).toDateString() === new Date().toDateString()).length,
    totalIn: scanHistory.filter(s => s.operation === 'in').reduce((sum, s) => sum + s.quantity, 0),
    totalOut: scanHistory.filter(s => s.operation === 'out').reduce((sum, s) => sum + s.quantity, 0)
  };

  const exportHistory = () => {
    const csv = [
      ['Timestamp', 'Product', 'SKU', 'Operation', 'Quantity', 'User'],
      ...scanHistory.map(h => [
        new Date(h.timestamp).toLocaleString('ar-EG'),
        h.product.name,
        h.product.sku,
        h.operation === 'in' ? 'إضافة' : 'صرف',
        h.quantity,
        h.user
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `scan-history-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6" dir="rtl">
        {/* Header */}
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">الماسح الضوئي</h1>
          <Button variant="outline" size="icon" onClick={() => setIsCameraOpen(!isCameraOpen)}>
            {isCameraOpen ? <X /> : <Camera />}
          </Button>
        </div>

        {/* --- CAMERA COMPONENT --- */}
        {isCameraOpen && (
          <Card className="border-2 border-blue-500 overflow-hidden">
            <div className="relative h-64 md:h-96 bg-black">
              <QrReader
                onResult={handleScan}
                constraints={{ facingMode: 'environment' }} // Back Camera
                className="w-full h-full object-cover"
                containerStyle={{ height: '100%' }}
                videoStyle={{ objectFit: 'cover' }}
              />
              {/* Overlay */}
              <div className="absolute inset-0 border-2 border-white/30 m-8 rounded-lg pointer-events-none" />
              <div className="absolute bottom-4 left-0 right-0 text-center text-white text-sm bg-black/50 py-1">
                وجه الكاميرا نحو الباركود
              </div>
            </div>
            <div className="flex justify-center p-2 bg-slate-100 gap-2">
              <Button variant="secondary" onClick={() => setContinuousScan(!continuousScan)}>
                <Zap className="w-4 h-4 mr-2" />
                {continuousScan ? 'تعطيل المستمر' : 'تفعيل المستمر'}
              </Button>
              <Button variant="destructive" onClick={() => setIsCameraOpen(false)}>
                إغلاق
              </Button>
            </div>
          </Card>
        )}

        {/* Manual Input */}
        {!scannedProduct && !isCameraOpen && (
          <Card>
            <CardContent className="pt-6">
              <div className="flex gap-2">
                <Input
                  ref={inputRef}
                  placeholder="بحث عن منتج (اسم أو كود)..."
                  value={barcode}
                  onChange={(e) => {
                    setBarcode(e.target.value);
                    updateSearchSuggestions(e.target.value);
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && findProduct(barcode)}
                />
                <Button onClick={() => findProduct(barcode)}><Search className="w-4 h-4" /></Button>
              </div>
              {/* Suggestions */}
              {searchSuggestions.length > 0 && (
                <div className="mt-2 border rounded-md divide-y">
                  {searchSuggestions.map(s => (
                    <div key={s.id} onClick={() => findProduct(s.sku)} className="p-2 hover:bg-slate-50 cursor-pointer flex justify-between">
                      <span>{s.name}</span>
                      <Badge variant="outline">{s.sku}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Scanned Product Actions */}
        {scannedProduct && (
          <div className="space-y-4">
            <Alert className="border-green-200 bg-green-50">
              <CheckCircle2 className="w-4 h-4 text-green-600" />
              <AlertDescription className="flex justify-between items-center w-full">
                <span className="font-bold">{scannedProduct.name}</span>
                <Button variant="ghost" size="sm" onClick={resetScanner}><X className="w-4 h-4" /></Button>
              </AlertDescription>
            </Alert>

            <div className="grid grid-cols-2 gap-2">
              <Card className="p-4 text-center bg-blue-50 border-blue-200">
                <p className="text-xs text-slate-500">السعر</p>
                <p className="text-xl font-bold text-blue-700">{scannedProduct.price}</p>
              </Card>
              <Card className="p-4 text-center">
                <p className="text-xs text-slate-500">المخزون الحالي</p>
                <p className="text-xl font-bold">{scannedProduct.quantity}</p>
              </Card>
            </div>

            <Card>
              <CardContent className="pt-6 space-y-4">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="in">إضافة (+)</TabsTrigger>
                    <TabsTrigger value="out">صرف (-)</TabsTrigger>
                  </TabsList>
                </Tabs>

                <div className="flex items-center justify-between gap-4">
                  <Button variant="outline" size="icon" onClick={() => setQuantity(Math.max(1, quantity - 1))}><Minus /></Button>
                  <span className="text-4xl font-bold">{quantity}</span>
                  <Button variant="outline" size="icon" onClick={() => setQuantity(quantity + 1)}><Plus /></Button>
                </div>

                {quickActions.length > 0 && (
                  <div className="flex gap-2 justify-center">
                    {quickActions.map(a => (
                      <Button key={a.label} variant="secondary" size="sm" onClick={() => setQuantity(a.quantity)}>{a.label}</Button>
                    ))}
                  </div>
                )}

                <Button
                  className={`w-full h-12 text-lg ${activeTab === 'in' ? 'bg-green-600 hover:bg-green-700' : 'bg-orange-600 hover:bg-orange-700'}`}
                  onClick={handleSubmit}
                  disabled={isProcessing}
                >
                  {isProcessing ? <Loader2 className="animate-spin" /> : <CheckCircle2 className="mr-2" />}
                  تأكيد {activeTab === 'in' ? 'الإضافة' : 'الصرف'}
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Stats & History Toggle */}
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowStats(!showStats)} className="flex-1">
            <BarChart3 className="w-4 h-4 mr-2" /> الإحصائيات
          </Button>
          <Button variant="outline" size="sm" onClick={exportHistory} className="flex-1">
            <Download className="w-4 h-4 mr-2" /> تصدير
          </Button>
        </div>

        {/* Statistics Panel */}
        {showStats && (
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-blue-50 p-3 rounded-lg text-center">
              <p className="text-xs text-slate-500">اليوم</p>
              <p className="text-lg font-bold">{stats.todayScans}</p>
            </div>
            <div className="bg-green-50 p-3 rounded-lg text-center">
              <p className="text-xs text-slate-500">إضافة</p>
              <p className="text-lg font-bold text-green-700">{stats.totalIn}</p>
            </div>
          </div>
        )}

        {/* Recent History */}
        <Card>
          <CardHeader><CardTitle className="text-lg">آخر العمليات</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {scanHistory.length === 0 && <p className="text-muted-foreground text-center py-4">لا يوجد سجلات</p>}
              {scanHistory.slice(0, 5).map(h => (
                <div key={h.id} className="flex justify-between items-center p-2 border rounded bg-slate-50">
                  <div>
                    <div className="font-bold text-sm">{h.product?.name}</div>
                    <div className="text-xs text-muted-foreground">{new Date(h.timestamp).toLocaleTimeString()}</div>
                  </div>
                  <Badge variant={h.operation === 'in' ? 'default' : 'secondary'}>
                    {h.operation === 'in' ? '+' : '-'}{h.quantity}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Scanner;