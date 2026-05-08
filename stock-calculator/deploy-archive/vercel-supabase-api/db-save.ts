import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// Server-side Supabase client (service role)
const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE as string;

const admin = createClient(SUPABASE_URL as string, SERVICE_ROLE, { auth: { persistSession: false } });

type SaveType = 'sales' | 'purchases' | 'stocks' | 'orders';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Require auth token from client
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    // Resolve user from token
    const { data: userRes, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userRes?.user) return res.status(401).json({ error: 'Invalid token' });
    const userId = userRes.user.id;

    const { type, records } = req.body || {};
    if (!type || !['sales', 'purchases', 'stocks', 'orders'].includes(type)) {
      return res.status(400).json({ error: 'Invalid or missing type' });
    }
    if (!Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ error: 'records must be a non-empty array' });
    }

    if (type === 'sales') {
      // Expect mapped structure from wb-sales.ts
      const rows = records.map((r: any) => {
        const saleId = String(r.saleID || r.gNumber || r.srid || `${r.nmId || r.nmid}-${r.date}-${r.barcode || ''}`);
        return {
        user_id: userId,
        date: r.date,
        sku: String(r.nmId),
        units: Number(r.quantity || 0),
        revenue: r.totalPrice !== undefined ? Number(r.totalPrice) : null,
        sale_id: saleId,
        warehouse: r.warehouseName || null,
        raw: r
      }});
      const { error } = await admin.from('wb_sales').upsert(rows, { onConflict: 'user_id,sale_id', ignoreDuplicates: true as any });
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true, inserted: rows.length });
    }

    if (type === 'purchases') {
      const rows = records.map((r: any) => ({
        user_id: userId,
        date: r.date,
        sku: String(r.nmId),
        quantity: Number(r.quantity || 0),
        total_price: r.totalPrice !== undefined ? Number(r.totalPrice) : null,
        income_id: r.incomeId ? String(r.incomeId) : null,
        warehouse: r.warehouse || null,
        raw: r
      }));
      const { error } = await admin.from('wb_purchases').upsert(rows, { onConflict: 'user_id,income_id', ignoreDuplicates: true as any });
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true, inserted: rows.length });
    }

    if (type === 'stocks') {
      const rows = records.map((r: any) => ({
        user_id: userId,
        date: r.date,
        sku: String(r.nmId),
        barcode: r.barcode || null,
        tech_size: r.techSize || null,
        quantity: Number(r.quantity || 0),
        in_way_to_client: Number(r.inWayToClient || 0),
        in_way_from_client: Number(r.inWayFromClient || 0),
        warehouse: r.warehouse || r.warehouseName || null,
        price: r.price !== undefined ? Number(r.price) : null,
        discount: r.discount !== undefined ? Number(r.discount) : null,
        raw: r
      }));
      // Use composite conflict target to avoid duplicates on refreshes
      const { error } = await admin.from('wb_stocks').upsert(rows, { onConflict: 'user_id,sku,barcode,warehouse,date', ignoreDuplicates: true as any });
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true, inserted: rows.length });
    }

    if (type === 'orders') {
      const rows = records.map((r: any) => ({
        user_id: userId,
        order_id: String(r.id),
        created_at: r.createdAt || null,
        status: r.status || null,
        nm_id: r.nmId !== undefined ? String(r.nmId) : null,
        price: r.price !== undefined ? Number(r.price) : null,
        currency: r.currencyCode || null,
        address: r.address || null,
        raw: r
      }));
      const { error } = await admin.from('wb_orders').upsert(rows, { onConflict: 'user_id,order_id', ignoreDuplicates: true as any });
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true, inserted: rows.length });
    }

    return res.status(400).json({ error: 'Unsupported type' });
  } catch (e: any) {
    return res.status(500).json({ error: e.message || 'Unknown error' });
  }
}


