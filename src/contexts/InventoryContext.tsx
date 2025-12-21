import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
// We define simplified types here to match your actual DB structure
export interface Product {
  id: string;
  created_at?: string;
  updated_at?: string;
  name: string;
  sku: string;
  price: number;
  quantity: number; // Direct quantity
  image_url?: string;
  category?: string;
  supplier?: string;
  cost?: number;
  reorderPoint?: number;
  barcodes?: string[]; // Optional if you added this, otherwise we search SKU
}

export interface AuditLog {
  id: string;
  created_at: string;
  user_email?: string;
  action: 'SCAN_IN' | 'SCAN_OUT' | 'ADJUST' | 'CREATE' | 'UPDATE' | 'DELETE';
  details: any;
}

interface InventoryContextType {
  products: Product[];
  auditLogs: AuditLog[];
  loading: boolean;
  isOnline: boolean;
  addProduct: (product: Omit<Product, 'id' | 'created_at' | 'updated_at'>) => Promise<Product | null>;
  updateProduct: (id: string, updates: Partial<Product>) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  scanIn: (productId: string, quantity: number) => Promise<void>; // Removed batchId
  scanOut: (productId: string, quantity: number) => Promise<void>; // Removed batchId
  adjustStock: (productId: string, newQuantity: number, reason: string) => Promise<void>;
  getProductByBarcode: (barcode: string) => Product | undefined;
  getTotalStock: (productId: string) => number;
  refreshData: () => Promise<void>;
  clearAllData: () => Promise<void>;
}

const InventoryContext = createContext<InventoryContextType | undefined>(undefined);

export const InventoryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Network Status Listeners
  useEffect(() => {
    const handleOnline = () => { setIsOnline(true); toast.success('Connection restored'); };
    const handleOffline = () => { setIsOnline(false); toast.error('Connection lost - changes may not sync'); };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Fetch Data (Products & Logs only)
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [productsRes, logsRes] = await Promise.all([
        supabase.from('products').select('*').order('name'),
        supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(100)
      ]);

      if (productsRes.data) setProducts(productsRes.data as unknown as Product[]);
      if (logsRes.data) setAuditLogs(logsRes.data as unknown as AuditLog[]);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  // Real-time Subscriptions
  useEffect(() => {
    fetchData();

    const productsChannel = supabase.channel('products-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => fetchData())
      .subscribe();

    const logsChannel = supabase.channel('logs-changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'audit_logs' }, () => fetchData())
      .subscribe();

    return () => {
      supabase.removeChannel(productsChannel);
      supabase.removeChannel(logsChannel);
    };
  }, [fetchData]);

  // Helper to log actions
  const logAction = async (action: string, details: any) => {
    // We try to get the current user, but won't block if auth is missing
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.email) {
      await supabase.from('audit_logs').insert({
        user_email: user.email,
        action,
        details
      } as never);
    }
  };

  // --- PRODUCT ACTIONS ---

  const addProduct = async (product: Omit<Product, 'id' | 'created_at' | 'updated_at'>) => {
    const { data, error } = await supabase.from('products').insert(product as never).select().single();
    if (error) { toast.error('Failed to add product'); return null; }

    await logAction('CREATE', { name: product.name, sku: product.sku });
    return data as unknown as Product;
  };

  const updateProduct = async (id: string, updates: Partial<Product>) => {
    const { error } = await supabase.from('products').update({ ...updates, updated_at: new Date().toISOString() } as never).eq('id', id);
    if (error) toast.error('Failed to update product');
    else await logAction('UPDATE', { id, updates });
  };

  const deleteProduct = async (id: string) => {
    const { error } = await supabase.from('products').delete().eq('id', id);
    if (error) toast.error('Failed to delete product');
    else await logAction('DELETE', { id });
  };

  // --- STOCK ACTIONS (Simplified for Single Table) ---

  const scanIn = async (productId: string, quantity: number) => {
    const product = products.find(p => p.id === productId);
    if (product) {
      const newQty = (product.quantity || 0) + quantity;
      await updateProduct(productId, { quantity: newQty });
      await logAction('SCAN_IN', { product_name: product.name, added: quantity, new_total: newQty });
      toast.success(`Scanned in ${quantity} units`);
    }
  };

  const scanOut = async (productId: string, quantity: number) => {
    const product = products.find(p => p.id === productId);
    if (product) {
      if ((product.quantity || 0) >= quantity) {
        const newQty = product.quantity - quantity;
        await updateProduct(productId, { quantity: newQty });
        await logAction('SCAN_OUT', { product_name: product.name, removed: quantity, new_total: newQty });
        toast.success(`Scanned out ${quantity} units`);
      } else {
        toast.error('Insufficient stock');
      }
    }
  };

  const adjustStock = async (productId: string, newQuantity: number, reason: string) => {
    const product = products.find(p => p.id === productId);
    if (product) {
      const oldQuantity = product.quantity;
      await updateProduct(productId, { quantity: newQuantity });
      await logAction('ADJUST', { product_name: product.name, old: oldQuantity, new: newQuantity, reason });
      toast.success('Stock adjusted');
    }
  };

  // --- HELPERS ---

  const getProductByBarcode = (barcode: string) => {
    // Checks if SKU matches OR if the barcode is inside the barcodes array (if you have one)
    return products.find(p =>
      p.sku === barcode ||
      (p.barcodes && p.barcodes.includes(barcode))
    );
  };

  const getTotalStock = (productId: string) => {
    const product = products.find(p => p.id === productId);
    return product ? (product.quantity || 0) : 0;
  };

  const clearAllData = async () => {
    if (!confirm('Are you sure? This will delete ALL products and logs.')) return;
    try {
      // 1. Delete Logs
      const { error: logError } = await supabase.from('audit_logs').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (logError) throw logError;

      // 2. Delete Products
      const { error: prodError } = await supabase.from('products').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (prodError) throw prodError;

      setProducts([]);
      setAuditLogs([]);
      toast.success('All data cleared.');
    } catch (error: any) {
      console.error(error);
      toast.error('Failed to clear data.');
    }
  };

  const refreshData = fetchData;

  return (
    <InventoryContext.Provider value={{
      products, auditLogs, loading, isOnline,
      addProduct, updateProduct, deleteProduct,
      scanIn, scanOut, adjustStock,
      getProductByBarcode, getTotalStock, refreshData, clearAllData
    }}>
      {children}
    </InventoryContext.Provider>
  );
};

export const useInventory = () => {
  const context = useContext(InventoryContext);
  if (context === undefined) throw new Error('useInventory must be used within an InventoryProvider');
  return context;
};