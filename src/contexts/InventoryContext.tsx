import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Product, Batch, AuditLog, AuditAction } from '@/types/database';
import { useAuth } from './AuthContext';
import { toast } from 'sonner';

interface InventoryContextType {
  products: Product[];
  batches: Batch[];
  auditLogs: AuditLog[];
  loading: boolean;
  isOnline: boolean;
  addProduct: (product: Omit<Product, 'id' | 'created_at' | 'updated_at'>) => Promise<Product | null>;
  updateProduct: (id: string, updates: Partial<Product>) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  addBatch: (batch: Omit<Batch, 'id' | 'created_at' | 'updated_at'>) => Promise<Batch | null>;
  updateBatch: (id: string, updates: Partial<Batch>) => Promise<void>;
  deleteBatch: (id: string) => Promise<void>;
  scanIn: (productId: string, batchId: string, quantity: number) => Promise<void>;
  scanOut: (productId: string, batchId: string, quantity: number) => Promise<void>;
  adjustStock: (productId: string, batchId: string, newQuantity: number, reason: string) => Promise<void>;
  getProductByBarcode: (barcode: string) => Product | undefined;
  getTotalStock: (productId: string) => number;
  refreshData: () => Promise<void>;
}

const InventoryContext = createContext<InventoryContextType | undefined>(undefined);

export const InventoryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      toast.success('Connection restored');
    };
    const handleOffline = () => {
      setIsOnline(false);
      toast.error('Connection lost - changes may not sync');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      
      const [productsRes, batchesRes, logsRes] = await Promise.all([
        supabase.from('products').select('*').order('name'),
        supabase.from('batches').select('*').order('expiry_date'),
        supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(100)
      ]);

      if (productsRes.data) setProducts(productsRes.data as unknown as Product[]);
      if (batchesRes.data) setBatches(batchesRes.data as unknown as Batch[]);
      if (logsRes.data) setAuditLogs(logsRes.data as unknown as AuditLog[]);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;

    fetchData();

    const productsChannel = supabase
      .channel('products-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'products' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setProducts(prev => [...prev, payload.new as Product]);
          } else if (payload.eventType === 'UPDATE') {
            setProducts(prev => prev.map(p => p.id === (payload.new as Product).id ? payload.new as Product : p));
          } else if (payload.eventType === 'DELETE') {
            setProducts(prev => prev.filter(p => p.id !== (payload.old as Product).id));
          }
        }
      )
      .subscribe();

    const batchesChannel = supabase
      .channel('batches-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'batches' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setBatches(prev => [...prev, payload.new as Batch]);
          } else if (payload.eventType === 'UPDATE') {
            setBatches(prev => prev.map(b => b.id === (payload.new as Batch).id ? payload.new as Batch : b));
          } else if (payload.eventType === 'DELETE') {
            setBatches(prev => prev.filter(b => b.id !== (payload.old as Batch).id));
          }
        }
      )
      .subscribe();

    const logsChannel = supabase
      .channel('logs-changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'audit_logs' },
        (payload) => {
          setAuditLogs(prev => [payload.new as AuditLog, ...prev.slice(0, 99)]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(productsChannel);
      supabase.removeChannel(batchesChannel);
      supabase.removeChannel(logsChannel);
    };
  }, [user, fetchData]);

  const logAction = async (action: AuditAction, details: Record<string, unknown>) => {
    if (!user?.email) return;
    
    await supabase.from('audit_logs').insert({
      user_email: user.email,
      action,
      details
    } as never);
  };

  const addProduct = async (product: Omit<Product, 'id' | 'created_at' | 'updated_at'>) => {
    const { data, error } = await supabase
      .from('products')
      .insert(product as never)
      .select()
      .single();
    
    if (error) {
      toast.error('Failed to add product');
      return null;
    }
    
    return data as unknown as Product;
  };

  const updateProduct = async (id: string, updates: Partial<Product>) => {
    const { error } = await supabase
      .from('products')
      .update({ ...updates, updated_at: new Date().toISOString() } as never)
      .eq('id', id);
    
    if (error) toast.error('Failed to update product');
  };

  const deleteProduct = async (id: string) => {
    const { error } = await supabase.from('products').delete().eq('id', id);
    if (error) toast.error('Failed to delete product');
  };

  const addBatch = async (batch: Omit<Batch, 'id' | 'created_at' | 'updated_at'>) => {
    const { data, error } = await supabase
      .from('batches')
      .insert(batch as never)
      .select()
      .single();
    
    if (error) {
      toast.error('Failed to add batch');
      return null;
    }
    
    return data as unknown as Batch;
  };

  const updateBatch = async (id: string, updates: Partial<Batch>) => {
    const { error } = await supabase
      .from('batches')
      .update({ ...updates, updated_at: new Date().toISOString() } as never)
      .eq('id', id);
    
    if (error) toast.error('Failed to update batch');
  };

  const deleteBatch = async (id: string) => {
    const { error } = await supabase.from('batches').delete().eq('id', id);
    if (error) toast.error('Failed to delete batch');
  };

  const scanIn = async (productId: string, batchId: string, quantity: number) => {
    const batch = batches.find(b => b.id === batchId);
    const product = products.find(p => p.id === productId);
    
    if (batch) {
      await updateBatch(batchId, { quantity: batch.quantity + quantity });
      await logAction('SCAN_IN', {
        product_id: productId,
        product_name: product?.name,
        batch_id: batchId,
        quantity_added: quantity,
        new_total: batch.quantity + quantity
      });
      toast.success(`Scanned in ${quantity} units`);
    }
  };

  const scanOut = async (productId: string, batchId: string, quantity: number) => {
    const batch = batches.find(b => b.id === batchId);
    const product = products.find(p => p.id === productId);
    
    if (batch && batch.quantity >= quantity) {
      await updateBatch(batchId, { quantity: batch.quantity - quantity });
      await logAction('SCAN_OUT', {
        product_id: productId,
        product_name: product?.name,
        batch_id: batchId,
        quantity_removed: quantity,
        new_total: batch.quantity - quantity
      });
      toast.success(`Scanned out ${quantity} units`);
    } else {
      toast.error('Insufficient stock');
    }
  };

  const adjustStock = async (productId: string, batchId: string, newQuantity: number, reason: string) => {
    const batch = batches.find(b => b.id === batchId);
    const product = products.find(p => p.id === productId);
    
    if (batch) {
      const oldQuantity = batch.quantity;
      await updateBatch(batchId, { quantity: newQuantity });
      await logAction('ADJUST', {
        product_id: productId,
        product_name: product?.name,
        batch_id: batchId,
        old_quantity: oldQuantity,
        new_quantity: newQuantity,
        reason
      });
      toast.success('Stock adjusted');
    }
  };

  const getProductByBarcode = (barcode: string) => {
    return products.find(p => p.barcodes.includes(barcode));
  };

  const getTotalStock = (productId: string) => {
    return batches
      .filter(b => b.product_id === productId)
      .reduce((sum, b) => sum + b.quantity, 0);
  };

  const refreshData = fetchData;

  return (
    <InventoryContext.Provider value={{
      products,
      batches,
      auditLogs,
      loading,
      isOnline,
      addProduct,
      updateProduct,
      deleteProduct,
      addBatch,
      updateBatch,
      deleteBatch,
      scanIn,
      scanOut,
      adjustStock,
      getProductByBarcode,
      getTotalStock,
      refreshData
    }}>
      {children}
    </InventoryContext.Provider>
  );
};

export const useInventory = () => {
  const context = useContext(InventoryContext);
  if (context === undefined) {
    throw new Error('useInventory must be used within an InventoryProvider');
  }
  return context;
};
