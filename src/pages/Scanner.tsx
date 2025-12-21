import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Scan, Search, Minus, Plus, Camera, CheckCircle2,
  History, TrendingUp, Package, AlertTriangle,
  Download, Zap, Clock, BarChart3, X, ChevronRight
} from 'lucide-react';

// Mock Inventory Context (replace with actual context in production)
const useInventory = () => {
  const [products] = useState([
    {
      id: '1',
      name: 'iPhone 15 Pro',
      sku: 'APL-IP15P-256',
      price: 999,
      totalStock: 45,
      barcodes: ['194253908913', 'iPhone15Pro'],
      category: 'Electronics',
      reorderPoint: 10
    },
    {
      id: '2',
      name: 'Samsung Galaxy S24',
      sku: 'SAM-GS24-128',
      price: 799,
      totalStock: 32,
      barcodes: ['887276764665', 'GalaxyS24'],
      category: 'Electronics',
      reorderPoint: 15
    },
    {
      id: '3',
      name: 'Sony WH-1000XM5',
      sku: 'SNY-WH1000XM5',
      price: 399,
      totalStock: 78,
      barcodes: ['027242923935', 'WH1000XM5'],
      category: 'Audio',
      reorderPoint: 20
    }
  ]);

  const [batches] = useState([
    { id: 'b1', product_id: '1', quantity: 45, expiryDate: null },
    { id: 'b2', product_id: '2', quantity: 32, expiryDate: null },
    { id: 'b3', product_id: '3', quantity: 78, expiryDate: null }
  ]);

  const getProductByBarcode = (barcode) => {
    return products.find(p => p.barcodes.some(b => b.toLowerCase().includes(barcode.toLowerCase())));
  };

  const scanIn = async (productId, batchId, quantity) => {
    await new Promise(resolve => setTimeout(resolve, 500));
    return { success: true };
  };

  const scanOut = async (productId, batchId, quantity) => {
    await new Promise(resolve => setTimeout(resolve, 500));
    return { success: true };
  };

  return { products, batches, scanIn, scanOut, getProductByBarcode };
};

const Scanner = () => {
  const { products, batches, scanIn, scanOut, getProductByBarcode } = useInventory();

  // Core state
  const [barcode, setBarcode] = useState('');
  const [activeTab, setActiveTab] = useState('in');
  const [scannedProduct, setScannedProduct] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Advanced features state
  const [recentScans, setRecentScans] = useState([]);
  const [scanHistory, setScanHistory] = useState([]);
  const [continuousScan, setContinuousScan] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [showStats, setShowStats] = useState(false);
  const [quickActions, setQuickActions] = useState([]);
  const [searchSuggestions, setSearchSuggestions] = useState([]);

  const inputRef = useRef(null);
  const audioContextRef = useRef(null);
  const scanTimeoutRef = useRef(null);

  // Initialize audio context
  useEffect(() => {
    audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
    return () => audioContextRef.current?.close();
  }, []);

  // Play sound feedback
  const playSound = useCallback((type) => {
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
  const vibrate = useCallback((pattern) => {
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

  // Load scan history from storage
  useEffect(() => {
    const loadHistory = async () => {
      try {
        const result = await window.storage.get('scan_history');
        if (result) {
          setScanHistory(JSON.parse(result.value));
        }
      } catch (error) {
        console.log('No history found');
      }
    };
    loadHistory();
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e) => {
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

  // Search suggestions with fuzzy matching
  const updateSearchSuggestions = useCallback((term) => {
    if (!term || term.length < 2) {
      setSearchSuggestions([]);
      return;
    }

    const cleanTerm = term.toLowerCase();
    const matches = products
      .filter(p =>
        p.name.toLowerCase().includes(cleanTerm) ||
        p.sku.toLowerCase().includes(cleanTerm) ||
        p.barcodes.some(b => b.toLowerCase().includes(cleanTerm))
      )
      .slice(0, 5);

    setSearchSuggestions(matches);
  }, [products]);

  // Enhanced product search
  const findProduct = useCallback((term) => {
    if (!term) return;

    const cleanTerm = term.trim().toLowerCase();
    let found = getProductByBarcode(term);

    if (!found) {
      // Fuzzy search
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
      setSearchSuggestions([]);
      playSound('success');
      vibrate([50]);

      // Add to recent scans
      setRecentScans(prev => {
        const filtered = prev.filter(p => p.id !== found.id);
        return [found, ...filtered].slice(0, 5);
      });

      // Update quick actions
      updateQuickActions(found);

      showToast('success', 'تم العثور على المنتج', found.name);
    } else {
      playSound('error');
      vibrate([100, 50, 100]);
      showToast('error', 'غير موجود', `لا يوجد منتج يطابق "${term}"`);
      setBarcode('');
    }
  }, [products, getProductByBarcode, playSound, vibrate]);

  // Update quick actions based on product
  const updateQuickActions = useCallback((product) => {
    const actions = [
      { label: '+1', quantity: 1 },
      { label: '+5', quantity: 5 },
      { label: '+10', quantity: 10 },
      { label: '+50', quantity: 50 }
    ];
    setQuickActions(actions);
  }, []);

  // Toast notification system
  const showToast = useCallback((type, title, description) => {
    // In production, use sonner toast
    console.log(`${type}: ${title} - ${description}`);
  }, []);

  // Handle form submission
  const handleSearch = (e) => {
    e.preventDefault();
    findProduct(barcode);
  };

  // Handle camera scan
  const handleCameraScan = useCallback((detectedCodes) => {
    if (detectedCodes && detectedCodes.length > 0) {
      const code = detectedCodes[0].rawValue;

      if (continuousScan) {
        // Debounce continuous scanning
        if (scanTimeoutRef.current) {
          clearTimeout(scanTimeoutRef.current);
        }

        scanTimeoutRef.current = setTimeout(() => {
          findProduct(code);

          // Auto-submit after 2 seconds in continuous mode
          setTimeout(() => {
            if (scannedProduct) {
              handleSubmit();
            }
          }, 2000);
        }, 300);
      } else {
        findProduct(code);
      }
    }
  }, [continuousScan, findProduct, scannedProduct]);

  // Enhanced submission with batch logic
  const handleSubmit = async () => {
    if (!scannedProduct || isProcessing) return;

    setIsProcessing(true);

    const productBatches = batches.filter(b => b.product_id === scannedProduct.id);
    const targetBatch = productBatches.length > 0 ? productBatches[0] : null;

    if (!targetBatch) {
      showToast('error', 'لا توجد دفعة', 'يجب تهيئة المخزون لهذا المنتج أولاً');
      playSound('error');
      setIsProcessing(false);
      return;
    }

    try {
      const operation = activeTab === 'in' ? 'إضافة' : 'صرف';

      if (activeTab === 'in') {
        await scanIn(scannedProduct.id, targetBatch.id, quantity);
      } else {
        await scanOut(scannedProduct.id, targetBatch.id, quantity);
      }

      // Log to history
      const historyEntry = {
        id: Date.now().toString(),
        product: scannedProduct,
        operation: activeTab,
        quantity,
        timestamp: new Date().toISOString(),
        user: 'Current User'
      };

      const newHistory = [historyEntry, ...scanHistory].slice(0, 100);
      setScanHistory(newHistory);

      // Save to storage
      await window.storage.set('scan_history', JSON.stringify(newHistory));

      playSound('success');
      vibrate([50, 100, 50]);
      showToast('success', `تمت ${operation} بنجاح`, `${quantity} × ${scannedProduct.name}`);

      // Auto-reset in continuous mode
      if (continuousScan) {
        setTimeout(() => resetScanner(), 1000);
      } else {
        resetScanner();
      }
    } catch (error) {
      playSound('error');
      showToast('error', 'حدث خطأ', error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  // Reset scanner
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

  // Export history as CSV
  const exportHistory = () => {
    const csv = [
      ['Timestamp', 'Product', 'SKU', 'Operation', 'Quantity', 'User'],
      ...scanHistory.map(h => [
        new Date(h.timestamp).toLocaleString(),
        h.product.name,
        h.product.sku,
        h.operation === 'in' ? 'In' : 'Out',
        h.quantity,
        h.user
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `scan-history-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <div className="max-w-6xl mx-auto space-y-4">
        {/* Header */}
        <Card className="border-2 border-blue-200 shadow-lg">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500 rounded-lg">
                  <Scan className="w-6 h-6 text-white" />
                </div>
                <div>
                  <CardTitle className="text-2xl">الماسح الضوئي الاحترافي</CardTitle>
                  <p className="text-sm text-slate-500 mt-1">نظام إدارة المخزون المتقدم</p>
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
                              المسح المستمر: {continuousScan ? 'مفعّل' : 'معطّل'}
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
                            {continuousScan ? 'تعطيل' : 'تفعيل'} المسح المستمر
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
                              placeholder="امسح أو اكتب رمز المنتج (Ctrl+K)..."
                              className="text-lg h-14 pr-12 text-right"
                              autoFocus
                            />
                            <Search className="absolute right-4 top-4 w-5 h-5 text-slate-400" />
                          </div>

                          {/* Search Suggestions */}
                          {searchSuggestions.length > 0 && (
                            <Card className="border-slate-200">
                              <CardContent className="p-2">
                                {searchSuggestions.map(product => (
                                  <button
                                    key={product.id}
                                    onClick={() => findProduct(product.sku)}
                                    className="w-full text-right p-3 hover:bg-slate-50 rounded-lg transition-colors flex items-center justify-between"
                                  >
                                    <Badge variant="secondary">{product.sku}</Badge>
                                    <div>
                                      <p className="font-medium">{product.name}</p>
                                      <p className="text-sm text-slate-500">
                                        المخزون: {product.totalStock}
                                      </p>
                                    </div>
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
                                  <ChevronRight className="w-4 h-4 text-slate-400" />
                                  <div>
                                    <p className="font-medium text-sm">{product.name}</p>
                                    <p className="text-xs text-slate-500">{product.sku}</p>
                                  </div>
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
                          <AlertDescription className="text-right">
                            <div className="flex items-center justify-between">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={resetScanner}
                                className="gap-2"
                              >
                                <X className="w-4 h-4" />
                                إلغاء
                              </Button>
                              <div>
                                <div className="flex items-center gap-2 mb-1">
                                  <Badge variant="secondary">{scannedProduct.sku}</Badge>
                                  <Package className="w-4 h-4 text-slate-500" />
                                </div>
                                <p className="font-bold text-lg">{scannedProduct.name}</p>
                              </div>
                            </div>
                          </AlertDescription>
                        </Alert>

                        <div className="grid grid-cols-2 gap-4">
                          <Card className="bg-blue-50 border-blue-200">
                            <CardContent className="pt-4 text-center">
                              <p className="text-sm text-slate-600 mb-1">السعر</p>
                              <p className="text-2xl font-bold text-blue-600">
                                ${scannedProduct.price}
                              </p>
                            </CardContent>
                          </Card>

                          <Card className={`border-2 ${scannedProduct.totalStock <= scannedProduct.reorderPoint
                              ? 'bg-orange-50 border-orange-300'
                              : 'bg-emerald-50 border-emerald-200'
                            }`}>
                            <CardContent className="pt-4 text-center">
                              <div className="flex items-center justify-center gap-2 mb-1">
                                {scannedProduct.totalStock <= scannedProduct.reorderPoint && (
                                  <AlertTriangle className="w-4 h-4 text-orange-500" />
                                )}
                                <p className="text-sm text-slate-600">المخزون الحالي</p>
                              </div>
                              <p className={`text-2xl font-bold ${scannedProduct.totalStock <= scannedProduct.reorderPoint
                                  ? 'text-orange-600'
                                  : 'text-emerald-600'
                                }`}>
                                {scannedProduct.totalStock}
                              </p>
                            </CardContent>
                          </Card>
                        </div>

                        {/* Quantity Controls */}
                        <Card>
                          <CardContent className="pt-6">
                            <div className="flex items-center justify-between mb-4">
                              <Button
                                onClick={() => setQuantity(q => Math.min(1000, q + 1))}
                                size="lg"
                                className="w-16 h-16 text-2xl"
                              >
                                <Plus className="w-6 h-6" />
                              </Button>

                              <div className="text-center">
                                <p className="text-sm text-slate-600 mb-2">الكمية</p>
                                <p className="text-4xl font-bold">{quantity}</p>
                              </div>

                              <Button
                                onClick={() => setQuantity(q => Math.max(1, q - 1))}
                                size="lg"
                                variant="outline"
                                className="w-16 h-16 text-2xl"
                              >
                                <Minus className="w-6 h-6" />
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
                                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                  جاري المعالجة...
                                </>
                              ) : (
                                <>
                                  <CheckCircle2 className="w-5 h-5" />
                                  تأكيد {activeTab === 'in' ? 'الإضافة' : 'الصرف'}
                                  (Enter)
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
                  سجل العمليات
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 max-h-[600px] overflow-y-auto">
                {scanHistory.length === 0 ? (
                  <p className="text-center text-slate-500 py-8 text-sm">
                    لا توجد عمليات حتى الآن
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
                      <p className="text-xs text-slate-500 text-right">
                        {new Date(item.timestamp).toLocaleString('ar-EG', {
                          hour: '2-digit',
                          minute: '2-digit',
                          day: 'numeric',
                          month: 'short'
                        })}
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
                  <span className="text-sm">الصوت</span>
                  <button
                    onClick={() => setSoundEnabled(!soundEnabled)}
                    className={`w-12 h-6 rounded-full transition-colors ${soundEnabled ? 'bg-blue-500' : 'bg-slate-300'
                      }`}
                  >
                    <div
                      className={`w-5 h-5 bg-white rounded-full transition-transform ${soundEnabled ? 'translate-x-6' : 'translate-x-1'
                        }`}
                    />
                  </button>
                </div>

                <div className="pt-2 border-t">
                  <p className="text-xs text-slate-500 mb-2">اختصارات لوحة المفاتيح</p>
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-600">Ctrl+K</span>
                      <span>التركيز على البحث</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Ctrl+C</span>
                      <span>فتح الكاميرا</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Enter</span>
                      <span>تأكيد العملية</span>
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
    </div>
  );
};

export default Scanner;