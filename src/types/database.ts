export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      products: {
        Row: {
          id: string
          name: string
          price: number
          sku: string
          barcodes: string[]
          image_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          price: number
          sku: string
          barcodes?: string[]
          image_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          price?: number
          sku?: string
          barcodes?: string[]
          image_url?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      batches: {
        Row: {
          id: string
          product_id: string
          quantity: number
          expiry_date: string
          batch_code: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          product_id: string
          quantity: number
          expiry_date: string
          batch_code: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          product_id?: string
          quantity?: number
          expiry_date?: string
          batch_code?: string
          created_at?: string
          updated_at?: string
        }
      }
      audit_logs: {
        Row: {
          id: string
          user_email: string
          action: 'SCAN_IN' | 'SCAN_OUT' | 'ADJUST'
          details: Json
          created_at: string
        }
        Insert: {
          id?: string
          user_email: string
          action: 'SCAN_IN' | 'SCAN_OUT' | 'ADJUST'
          details: Json
          created_at?: string
        }
        Update: {
          id?: string
          user_email?: string
          action?: 'SCAN_IN' | 'SCAN_OUT' | 'ADJUST'
          details?: Json
          created_at?: string
        }
      }
    }
  }
}

export type Product = Database['public']['Tables']['products']['Row'];
export type Batch = Database['public']['Tables']['batches']['Row'];
export type AuditLog = Database['public']['Tables']['audit_logs']['Row'];
export type AuditAction = 'SCAN_IN' | 'SCAN_OUT' | 'ADJUST';
