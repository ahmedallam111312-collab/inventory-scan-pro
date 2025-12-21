import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner'; // Ensure this is imported!

// Defined types
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

interface InventoryContextType {
  products: Product[];
  auditLogs: AuditLog[];
  loading: boolean;
  addProduct: (product: any) => Promise<any>;
  updateProduct: (id: string, updates: any) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  scanIn: (productId: string, quantity: number) => Promise<void>;
  scanOut: (productId: string, quantity: number) => Promise<void>;
  getTotalStock: (productId: string) => number;
  fetchProducts: () => Promise<void>; // Exposed for manual refresh
}

const InventoryContext = createContext<InventoryContextType | undefined>(undefined);

export const InventoryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  // 1. ROBUST FETCH FUNCTION
  const fetchProducts = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('name', { ascending: true });

      if (error) throw error;
      setProducts(data || []);
      console.log("Data refreshed:", data?.length, "products loaded");
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // 2. REAL-TIME LISTENER
  useEffect(() => {
    fetchProducts();

    const channel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'products',
        },
        () => {
          console.log("Realtime change detected! Refreshing...");
          fetchProducts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchProducts]);

  // 3. LOGGING HELPER
  const logAction = async (action: string, details: any) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.email) {
      await supabase.from('audit_logs').insert({
        user_email: user.email,
        action,
        details
      });
    }
  };

  // --- ACTIONS ---

  const addProduct = async (product: any) => {
    const { data, error } = await supabase.from('products').insert(product).select().single();
    if (error) { toast.error('Error adding product'); throw error; }
    await fetchProducts(); // Force refresh
    return data;
  };

  const updateProduct = async (id: string, updates: any) => {
    const { error } = await supabase.from('products').update(updates).eq('id', id);
    if (error) {
      console.error(error);
      toast.error('Database update failed');
      throw error;
    }
    await fetchProducts(); // Force refresh
  };

  const deleteProduct = async (id: string) => {
    await supabase.from('products').delete().eq('id', id);
    await fetchProducts(); // Force refresh
  };

  // --- SCANNING LOGIC (UPDATED) ---

  const scanIn = async (productId: string, quantityToAdd: number) => {
    // 1. Get latest stock directly from current state
    const product = products.find(p => p.id === productId);

    if (!product) {
      toast.error("Product not found in local state");
      return;
    }

    const currentQty = product.quantity || 0;
    const newQty = currentQty + quantityToAdd;

    console.log(`Updating ${product.name}: ${currentQty} -> ${newQty}`);

    // 2. Send update to Supabase
    try {
      await updateProduct(productId, { quantity: newQty });

      // 3. Log it
      await logAction('SCAN_IN', {
        name: product.name,
        added: quantityToAdd,
        old: currentQty,
        new: newQty
      });

      // 4. Force refresh explicitly
      await fetchProducts();

    } catch (err) {
      toast.error("Failed to update stock");
    }
  };

  const scanOut = async (productId: string, quantityToRemove: number) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    const currentQty = product.quantity || 0;

    if (currentQty < quantityToRemove) {
      toast.error("Insufficient stock!");
      return;
    }

    const newQty = currentQty - quantityToRemove;

    try {
      await updateProduct(productId, { quantity: newQty });
      await logAction('SCAN_OUT', { name: product.name, removed: quantityToRemove, new: newQty });
      await fetchProducts(); // Force refresh
    } catch (err) {
      toast.error("Failed to update stock");
    }
  };

  const getTotalStock = (productId: string) => {
    const product = products.find(p => p.id === productId);
    return product ? (product.quantity || 0) : 0;
  };

  return (
    <InventoryContext.Provider value={{
      products, auditLogs, loading,
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