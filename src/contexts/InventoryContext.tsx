import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface Product {
  id: string;
  name: string;
  sku: string;
  price: number;
  quantity: number;
  image_url?: string;
  category?: string;
  supplier?: string;
  cost?: number;
  reorderPoint?: number;
}

export interface AuditLog {
  id: string;
  created_at: string;
  user_email?: string;
  action: string;
  details: any;
}

// FIXED: Added 'batches' back to the type definition to prevent TS errors
interface InventoryContextType {
  products: Product[];
  batches: any[]; // Placeholder for legacy code
  auditLogs: AuditLog[];
  loading: boolean;
  addProduct: (product: any) => Promise<any>;
  updateProduct: (id: string, updates: any) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  scanIn: (productId: string, quantity: number) => Promise<void>;
  scanOut: (productId: string, quantity: number) => Promise<void>;
  getTotalStock: (productId: string) => number;
  fetchProducts: () => Promise<void>;
}

const InventoryContext = createContext<InventoryContextType | undefined>(undefined);

export const InventoryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchProducts = useCallback(async () => {
    try {
      // Fetch 10,000 items (Supabase default is 1000)
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .range(0, 9999)
        .order('name', { ascending: true });

      if (error) throw error;
      setProducts(data || []);
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
    const channel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'products' },
        () => fetchProducts()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchProducts]);

  // Logging Helper
  const logAction = async (action: string, details: any) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.email) {
      await supabase.from('audit_logs').insert({ user_email: user.email, action, details });
    }
  };

  // Actions
  const addProduct = async (product: any) => {
    const { data, error } = await supabase.from('products').insert(product).select().single();
    if (error) { toast.error('Error adding product'); throw error; }
    await fetchProducts();
    return data;
  };

  const updateProduct = async (id: string, updates: any) => {
    const { error } = await supabase.from('products').update(updates).eq('id', id);
    if (error) { toast.error('Update failed'); throw error; }
    await fetchProducts();
  };

  const deleteProduct = async (id: string) => {
    await supabase.from('products').delete().eq('id', id);
    await fetchProducts();
  };

  const scanIn = async (productId: string, quantityToAdd: number) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    const newQty = (product.quantity || 0) + quantityToAdd;

    try {
      await updateProduct(productId, { quantity: newQty });
      await logAction('SCAN_IN', { name: product.name, added: quantityToAdd, new: newQty });
      await fetchProducts();
    } catch (err) { toast.error("Failed to update stock"); }
  };

  const scanOut = async (productId: string, quantityToRemove: number) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    const currentQty = product.quantity || 0;

    if (currentQty < quantityToRemove) {
      toast.error("الكمية غير كافية!");
      return;
    }
    const newQty = currentQty - quantityToRemove;

    try {
      await updateProduct(productId, { quantity: newQty });
      await logAction('SCAN_OUT', { name: product.name, removed: quantityToRemove, new: newQty });
      await fetchProducts();
    } catch (err) { toast.error("Failed to update stock"); }
  };

  const getTotalStock = (productId: string) => {
    const product = products.find(p => p.id === productId);
    return product ? (product.quantity || 0) : 0;
  };

  return (
    <InventoryContext.Provider value={{
      products,
      batches: [], // FIXED: Empty array prevents "undefined" crashes in legacy code
      auditLogs,
      loading,
      addProduct, updateProduct, deleteProduct,
      scanIn, scanOut, getTotalStock, fetchProducts
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