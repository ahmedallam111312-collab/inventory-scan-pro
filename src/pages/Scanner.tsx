import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useInventory } from '@/contexts/InventoryContext';
import DashboardLayout from '@/components/layout/DashboardLayout'; // ADDED THIS FOR SIDEBAR
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

const Scanner = () => {
  const { products, updateProduct } = useInventory();

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

  // Initialize audio context
  useEffect(() => {
    audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    return () => { audioContextRef.current?.close(); };
  }, []);

  // Play sound feedback
  const playSound = useCallback((type: 'success' | 'error') => {
    if (!soundEnabled || !audioContextRef.current) return;

    const ctx = audioContextRef.current;
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    if (type === 'success') {
      oscillator.frequency.value = 800;
      oscillator.type = 'sine';
    } else if (type === 'error') {
      oscillator.frequency.value = 200;
      oscillator.type = 'square';
    }

    gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.2);
  }, [soundEnabled]);

  // Vibration feedback
  const vibrate = useCallback((pattern: number[]) => {
    if ('vibrate' in navigator) {
      navigator.vibrate(pattern);
    }
  }, []);

  // Focus management
  useEffect(() => {
    if (!isCameraOpen && !scannedProduct && !isProcessing) {
      inputRef.current?.focus();
    }
  }, [isCameraOpen, scannedProduct, isProcessing]);

  // Load scan history from LOCAL STORAGE
  useEffect(() => {
    const loadHistory = () => {
      try {
        const result = localStorage.getItem('scan_history');
        if (result) {
          setScanHistory(JSON.parse(result));
        }
      } catch (error) {
        console.log('No history found');
      }
    };
    loadHistory();
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case 'k':
            e.preventDefault();
            inputRef.current?.focus();
            break;
          case 'c':
            e.preventDefault();
            setIsCameraOpen(true);
            break;
          case 'r':
            e.preventDefault();
            resetScanner();
            break;
        }
      }

      if (scannedProduct) {
        if (e.key === 'Enter' && !isProcessing) {
          handleSubmit();
        } else if (e.key === 'Escape') {
          resetScanner();
        }
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [scannedProduct, isProcessing]);

  // Search suggestions
  const updateSearchSuggestions = useCallback((term: string) => {
    if (!term || term.length < 2) {
      setSearchSuggestions([]);
      return;
    }

    const cleanTerm = term.toLowerCase();
    const matches = products
      .filter(p =>
        (p.name && p.name.toLowerCase().includes(cleanTerm)) ||
        (p.sku && p.sku.toLowerCase().includes(cleanTerm))
      )
      .slice(0, 5);

    setSearchSuggestions(matches);
  }, [products]);

  // Enhanced product search (Adapted for Real DB)
  const findProduct = useCallback((term: string) => {
    if (!term) return;

    const cleanTerm = term.trim().toLowerCase();

    // Search by SKU or Name (Exact or Includes)
    const found = products.find(p =>
      (p.sku && p.sku.toLowerCase() === cleanTerm) ||
      (p.sku && p.sku.toLowerCase().includes(cleanTerm)) ||
      (p.name && p.name.toLowerCase().includes(cleanTerm))
    );

    if (found) {
      setScannedProduct(found);
      setBarcode('');
      setIsCameraOpen(false);
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

  // Update quick actions
  const updateQuickActions = useCallback((product: any) => {
    const actions = [
      { label: '+1', quantity: 1 },
      { label: '+5', quantity: 5 },
      { label: '+10', quantity: 10 },
      { label: '+50', quantity: 50 }
    ];
    setQuickActions(actions);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    findProduct(barcode);
  };

  // REAL SUBMISSION LOGIC
  const handleSubmit = async () => {
    if (!scannedProduct || isProcessing) return;

    setIsProcessing(true);

    try {
      const operationName = activeTab === 'in' ? 'تمت الإضافة' : 'تم الصرف';
      const currentQty = scannedProduct.quantity || 0;

      let newQuantity = currentQty;

      if (activeTab === 'in') {
        newQuantity = currentQty + quantity;
      } else {
        newQuantity = currentQty - quantity;
        if (newQuantity < 0) {
          toast.error("عفواً! المخزون غير كافي");
          setIsProcessing(false);
          return;
        }
      }

      // Update Supabase
      await updateProduct(scannedProduct.id, { quantity: newQuantity });

      // Log to local history
      const historyEntry = {
        id: Date.now().toString(),
        product: scannedProduct,
        operation: activeTab,
        quantity,
        timestamp: new Date().toISOString(),
        user: 'المستخدم الحالي'
      };

      const newHistory = [historyEntry, ...scanHistory].slice(0, 100);
      setScanHistory(newHistory);

      // Save to Local Storage
      localStorage.setItem('scan_history', JSON.stringify(newHistory));

      playSound('success');
      vibrate([50, 100, 50]);
      toast.success(`${operationName} بنجاح`, {
        description: `${quantity} × ${scannedProduct.name}`
      });

      if (continuousScan) {
        setTimeout(() => resetScanner(), 1000);
      } else {
        resetScanner();
      }
    } catch (error: any) {
      playSound('error');
      toast.error('حدث خطأ', { description: error.message });
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

  // Calculate statistics
  const stats = {
    totalScans: scanHistory.length,
    todayScans: scanHistory.filter(s => {
      const today = new Date().toDateString();
      return new Date(s.timestamp).toDateString() === today;
    }).length,
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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold font-heading">الماسح الضوئي</h1>
            <p className="text-muted-foreground mt-1">
              إدارة حركة المخزون (إضافة / صرف)
            </p>
          </div>
        </div>

        {/* Header Stats */}
        <Card className="border-2 border-blue-200 shadow-lg">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500 rounded-lg">
                  <Scan className="w-6 h-6 text-white" />
                </div>
                <div>
                  <CardTitle className="text-2xl">الماسح الاحترافي</CardTitle>
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowStats(!showStats)}
                  className="gap-2"
                >
                  <BarChart3 className="w-4 h-4" />
                  الإحصائيات
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={exportHistory}
                  className="gap-2"
                >
                  <Download className="w-4 h-4" />
                  تصدير
                </Button>
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Statistics Panel */}
        {showStats && (
          <Card className="border-blue-200">
            <CardContent className="pt-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <div className="flex items-center gap-2 text-blue-600 mb-1">
                    <TrendingUp className="w-4 h-4" />
                    <span className="text-sm font-medium">إجمالي العمليات</span>
                  </div>
                  <p className="text-2xl font-bold">{stats.totalScans}</p>
                </div>

                <div className="bg-green-50 p-4 rounded-lg">
                  <div className="flex items-center gap-2 text-green-600 mb-1">
                    <Clock className="w-4 h-4" />
                    <span className="text-sm font-medium">اليوم</span>
                  </div>
                  <p className="text-2xl font-bold">{stats.todayScans}</p>
                </div>

                <div className="bg-emerald-50 p-4 rounded-lg">
                  <div className="flex items-center gap-2 text-emerald-600 mb-1">
                    <Plus className="w-4 h-4" />
                    <span className="text-sm font-medium">إضافة</span>
                  </div>
                  <p className="text-2xl font-bold">{stats.totalIn}</p>
                </div>

                <div className="bg-orange-50 p-4 rounded-lg">
                  <div className="flex items-center gap-2 text-orange-600 mb-1">
                    <Minus className="w-4 h-4" />
                    <span className="text-sm font-medium">صرف</span>
                  </div>
                  <p className="text-2xl font-bold">{stats.totalOut}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid md:grid-cols-3 gap-4">
          {/* Main Scanner */}
          <div className="md:col-span-2">
            <Card className="border-2 border-slate-200 shadow-xl">
              <CardContent className="pt-6">
                <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v)} className="w-full">
                  <TabsList className="grid w-full grid-cols-2 mb-6">
                    <TabsTrigger value="in" className="gap-2">
                      <Plus className="w-4 h-4" />
                      إضافة (+)
                    </TabsTrigger>
                    <TabsTrigger value="out" className="gap-2">
                      <Minus className="w-4 h-4" />
                      صرف (-)
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value={activeTab} className="space-y-4">
                    {/* Camera View */}
                    {isCameraOpen && (
                      <div className="relative bg-black rounded-lg overflow-hidden" style={{ height: '400px' }}>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="text-center text-white p-8">
                            <Camera className="w-16 h-16 mx-auto mb-4 animate-pulse" />
                            <p className="text-lg mb-2">وجه الكاميرا نحو الباركود</p>
                            <p className="text-sm text-slate-300">
                              المسح المستمر: {continuousScan ? 'مفعل' : 'معطل'}
                            </p>
                          </div>
                        </div>

                        <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-2">
                          <Button
                            variant="secondary"
                            onClick={() => setContinuousScan(!continuousScan)}
                            className="gap-2"
                          >
                            <Zap className="w-4 h-4" />
                            {continuousScan ? 'تعطيل' : 'تفعيل'} المستمر
                          </Button>
                          <Button
                            variant="secondary"
                            onClick={() => setIsCameraOpen(false)}
                          >
                            إغلاق الكاميرا
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Search Interface */}
                    {!scannedProduct && !isCameraOpen && (
                      <div className="space-y-4">
                        <form onSubmit={handleSearch} className="space-y-3">
                          <div className="relative">
                            <Input
                              ref={inputRef}
                              value={barcode}
                              onChange={(e) => {
                                setBarcode(e.target.value);
                                updateSearchSuggestions(e.target.value);
                              }}
                              placeholder="امسح أو اكتب كود المنتج..."
                              className="text-lg h-14 pr-12 text-right"
                              autoFocus
                            />
                            <Search className="absolute left-4 top-4 w-5 h-5 text-slate-400" />
                          </div>

                          {/* Search Suggestions */}
                          {searchSuggestions.length > 0 && (
                            <Card className="border-slate-200">
                              <CardContent className="p-2">
                                {searchSuggestions.map(product => (
                                  <button
                                    key={product.id}
                                    type="button"
                                    onClick={() => findProduct(product.sku)}
                                    className="w-full text-right p-3 hover:bg-slate-50 rounded-lg transition-colors flex items-center justify-between"
                                  >
                                    <div className="flex items-center gap-3">
                                      <Badge variant="secondary">{product.sku}</Badge>
                                      <div>
                                        <p className="font-medium">{product.name}</p>
                                      </div>
                                    </div>
                                    <p className="text-sm text-slate-500">
                                      مخزون: {product.quantity || 0}
                                    </p>
                                  </button>
                                ))}
                              </CardContent>
                            </Card>
                          )}

                          <div className="flex gap-2">
                            <Button type="submit" className="flex-1 h-12 text-lg gap-2">
                              <Search className="w-5 h-5" />
                              بحث
                            </Button>
                            <Button
                              type="button"
                              onClick={() => setIsCameraOpen(true)}
                              className="h-12 px-6 gap-2"
                              variant="outline"
                            >
                              <Camera className="w-5 h-5" />
                              كاميرا
                            </Button>
                          </div>
                        </form>

                        {/* Recent Scans */}
                        {recentScans.length > 0 && (
                          <div className="pt-4 border-t">
                            <h3 className="text-sm font-medium text-slate-700 mb-3 flex items-center gap-2">
                              <History className="w-4 h-4" />
                              عمليات مسح حديثة
                            </h3>
                            <div className="space-y-2">
                              {recentScans.map(product => (
                                <button
                                  key={product.id}
                                  onClick={() => findProduct(product.sku)}
                                  className="w-full text-right p-3 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors flex items-center justify-between"
                                >
                                  <div>
                                    <p className="font-medium text-sm">{product.name}</p>
                                    <p className="text-xs text-slate-500">{product.sku}</p>
                                  </div>
                                  <ChevronLeft className="w-4 h-4 text-slate-400" />
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Product Details */}
                    {scannedProduct && (
                      <div className="space-y-4">
                        <Alert className="border-2 border-green-200 bg-green-50">
                          <CheckCircle2 className="w-5 h-5 text-green-600" />
                          <AlertDescription className="w-full">
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="flex items-center gap-2 mb-1">
                                  <Badge variant="secondary">{scannedProduct.sku}</Badge>
                                  <Package className="w-4 h-4 text-slate-500" />
                                </div>
                                <p className="font-bold text-lg">{scannedProduct.name}</p>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={resetScanner}
                                className="gap-2"
                              >
                                <X className="w-4 h-4" />
                                إلغاء
                              </Button>
                            </div>
                          </AlertDescription>
                        </Alert>

                        <div className="grid grid-cols-2 gap-4">
                          <Card className="bg-blue-50 border-blue-200">
                            <CardContent className="pt-4 text-center">
                              <p className="text-sm text-slate-600 mb-1">السعر</p>
                              <p className="text-2xl font-bold text-blue-600">
                                {scannedProduct.price} ج.م
                              </p>
                            </CardContent>
                          </Card>

                          <Card className={`border-2 ${(scannedProduct.quantity || 0) <= 10
                            ? 'bg-orange-50 border-orange-300'
                            : 'bg-emerald-50 border-emerald-200'
                            }`}>
                            <CardContent className="pt-4 text-center">
                              <div className="flex items-center justify-center gap-2 mb-1">
                                {(scannedProduct.quantity || 0) <= 10 && (
                                  <AlertTriangle className="w-4 h-4 text-orange-500" />
                                )}
                                <p className="text-sm text-slate-600">المخزون الحالي</p>
                              </div>
                              <p className={`text-2xl font-bold ${(scannedProduct.quantity || 0) <= 10
                                ? 'text-orange-600'
                                : 'text-emerald-600'
                                }`}>
                                {scannedProduct.quantity || 0}
                              </p>
                            </CardContent>
                          </Card>
                        </div>

                        {/* Quantity Controls */}
                        <Card>
                          <CardContent className="pt-6">
                            <div className="flex items-center justify-between mb-4">
                              <Button
                                onClick={() => setQuantity(q => Math.max(1, q - 1))}
                                size="lg"
                                variant="outline"
                                className="w-16 h-16 text-2xl"
                              >
                                <Minus className="w-6 h-6" />
                              </Button>

                              <div className="text-center">
                                <p className="text-sm text-slate-600 mb-2">الكمية</p>
                                <p className="text-4xl font-bold">{quantity}</p>
                              </div>

                              <Button
                                onClick={() => setQuantity(q => Math.min(1000, q + 1))}
                                size="lg"
                                className="w-16 h-16 text-2xl"
                              >
                                <Plus className="w-6 h-6" />
                              </Button>
                            </div>

                            {/* Quick Actions */}
                            {quickActions.length > 0 && (
                              <div className="flex gap-2 justify-center mb-4">
                                {quickActions.map(action => (
                                  <Button
                                    key={action.quantity}
                                    onClick={() => setQuantity(action.quantity)}
                                    variant="secondary"
                                    size="sm"
                                  >
                                    {action.label}
                                  </Button>
                                ))}
                              </div>
                            )}

                            <Button
                              onClick={handleSubmit}
                              disabled={isProcessing}
                              className="w-full h-14 text-lg gap-2"
                            >
                              {isProcessing ? (
                                <>
                                  <Loader2 className="w-5 h-5 animate-spin" />
                                  جاري المعالجة...
                                </>
                              ) : (
                                <>
                                  <CheckCircle2 className="w-5 h-5" />
                                  تأكيد {activeTab === 'in' ? 'الإضافة' : 'الصرف'} (Enter)
                                </>
                              )}
                            </Button>
                          </CardContent>
                        </Card>
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar - History */}
          <div className="space-y-4">
            <Card className="border-slate-200">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <History className="w-5 h-5" />
                  السجل
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 max-h-[600px] overflow-y-auto">
                {scanHistory.length === 0 ? (
                  <p className="text-center text-slate-500 py-8 text-sm">
                    لا يوجد عمليات حديثة
                  </p>
                ) : (
                  scanHistory.slice(0, 20).map((item) => (
                    <div
                      key={item.id}
                      className={`p-3 rounded-lg border-2 ${item.operation === 'in'
                        ? 'bg-green-50 border-green-200'
                        : 'bg-orange-50 border-orange-200'
                        }`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <Badge
                          variant={item.operation === 'in' ? 'default' : 'secondary'}
                          className="text-xs"
                        >
                          {item.operation === 'in' ? '+' : '-'}{item.quantity}
                        </Badge>
                        <div className="text-right flex-1 mr-2">
                          <p className="font-medium text-sm">{item.product.name}</p>
                          <p className="text-xs text-slate-500">{item.product.sku}</p>
                        </div>
                      </div>
                      <p className="text-xs text-slate-500 text-left" dir="ltr">
                        {new Date(item.timestamp).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {/* Settings */}
            <Card className="border-slate-200">
              <CardHeader>
                <CardTitle className="text-lg">الإعدادات</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm">الأصوات</span>
                  <button
                    onClick={() => setSoundEnabled(!soundEnabled)}
                    className={`w-12 h-6 rounded-full transition-colors ${soundEnabled ? 'bg-blue-500' : 'bg-slate-300'
                      }`}
                  >
                    <div
                      className={`w-5 h-5 bg-white rounded-full transition-transform ${soundEnabled ? '-translate-x-6' : '-translate-x-1'
                        }`}
                    />
                  </button>
                </div>

                <div className="pt-2 border-t">
                  <p className="text-xs text-slate-500 mb-2">الاختصارات</p>
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-600">Ctrl+K</span>
                      <span>البحث</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Ctrl+C</span>
                      <span>الكاميرا</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Enter</span>
                      <span>تأكيد</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Esc</span>
                      <span>إلغاء</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Scanner;