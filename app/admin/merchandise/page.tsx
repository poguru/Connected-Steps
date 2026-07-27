"use client";

import { useState, useEffect, useCallback } from "react";

interface Product {
  id: string;
  name: string;
  category: string;
  price_paise: number;
  price_rupees: number;
  gst_percentage: number;
  is_active: boolean;
  sku: string | null;
  image_url: string | null;
  merchandise_variants: Variant[];
}

interface Variant {
  id: string;
  variant_name: string;
  variant_type: string;
  stock_qty: number;
  reserved_qty: number;
  sold_qty: number;
  price_override: number | null;
}

interface Order {
  id: string;
  user_name: string;
  user_email: string;
  total_paise: number;
  total_rupees: number;
  status: string;
  payment_status: string;
  fulfillment_type: string;
  created_at: string;
}

const CATEGORIES = ["tshirt","medal","bib","nutrition","accessory","other"] as const;
const STATUS_COLORS: Record<string, string> = {
  pending: "#f59e0b", confirmed: "#3b82f6", packed: "#8b5cf6",
  dispatched: "#06b6d4", delivered: "#22c55e", cancelled: "#ef4444",
};

function fmt(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
}
function fmtR(r: number) {
  return `₹${r.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
}

export default function MerchandisePage() {
  const [tab,       setTab]       = useState<"products" | "orders">("products");
  const [products,  setProducts]  = useState<Product[]>([]);
  const [orders,    setOrders]    = useState<Order[]>([]);
  const [totalOrds, setTotalOrds] = useState(0);
  const [loading,   setLoading]   = useState(true);
  const [showForm,  setShowForm]  = useState(false);
  const [saving,    setSaving]    = useState(false);

  const [form, setForm] = useState({
    organization_id: "00000000-0000-0000-0000-000000000001",
    name: "", category: "tshirt", price_rupees: "", gst_percentage: "0",
    sku: "", description: "", image_url: "",
  });

  const loadProducts = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/merchandise/products");
    if (res.ok) setProducts((await res.json()).products ?? []);
    setLoading(false);
  }, []);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/merchandise/orders");
    if (res.ok) {
      const j = await res.json();
      setOrders(j.orders ?? []);
      setTotalOrds(j.total ?? 0);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (tab === "products") void loadProducts();
    else void loadOrders();
  }, [tab, loadProducts, loadOrders]);

  async function saveProduct() {
    if (!form.name || !form.price_rupees) { alert("Name and price required"); return; }
    setSaving(true);
    const res = await fetch("/api/admin/merchandise/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        price_rupees: parseFloat(form.price_rupees),
        gst_percentage: parseFloat(form.gst_percentage || "0"),
      }),
    });
    setSaving(false);
    if (res.ok) { setShowForm(false); void loadProducts(); }
    else alert("Failed to save");
  }

  async function toggleActive(id: string, is_active: boolean) {
    await fetch(`/api/admin/merchandise/products/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !is_active }),
    });
    void loadProducts();
  }

  async function updateOrderStatus(id: string, status: string) {
    await fetch("/api/admin/merchandise/orders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    void loadOrders();
  }

  const inputStyle: React.CSSProperties = {
    background: "#0d0d0d", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6,
    color: "#fff", fontSize: 12, padding: "6px 10px", fontFamily: "inherit", width: "100%", outline: "none",
  };

  const tabBtn = (t: "products" | "orders", label: string) => (
    <button onClick={() => setTab(t)} style={{
      background: tab === t ? "rgba(232,98,10,0.12)" : "none",
      border: `1px solid ${tab === t ? "#e8620a" : "rgba(255,255,255,0.08)"}`,
      borderRadius: 6, color: tab === t ? "#e8620a" : "#666",
      fontSize: 13, fontWeight: 600, padding: "6px 16px", cursor: "pointer", fontFamily: "inherit",
    }}>{label}</button>
  );

  return (
    <div style={{ padding: "24px 20px", maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#fff", margin: 0 }}>Merchandise</h1>
          <p style={{ fontSize: 13, color: "#555", margin: "4px 0 0" }}>Product catalog, inventory & orders</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {tabBtn("products", "Products")}
          {tabBtn("orders", `Orders (${totalOrds})`)}
          {tab === "products" && (
            <button onClick={() => setShowForm(s => !s)} style={{
              background: "#e8620a", border: "none", borderRadius: 8, color: "#fff",
              fontSize: 13, fontWeight: 600, padding: "8px 18px", cursor: "pointer", fontFamily: "inherit",
            }}>+ Add Product</button>
          )}
        </div>
      </div>

      {/* Add product form */}
      {tab === "products" && showForm && (
        <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: 20, marginBottom: 20 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: "#fff", margin: "0 0 16px" }}>New Product</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
            {[
              { key: "name",          label: "Product Name *",  type: "text" },
              { key: "price_rupees",  label: "Price (₹) *",     type: "number" },
              { key: "gst_percentage",label: "GST %",           type: "number" },
              { key: "sku",           label: "SKU",             type: "text" },
              { key: "image_url",     label: "Image URL",       type: "url" },
            ].map(f => (
              <div key={f.key}>
                <label style={{ fontSize: 10, color: "#555", display: "block", marginBottom: 4 }}>{f.label}</label>
                <input type={f.type} value={String(form[f.key as keyof typeof form])}
                  onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} style={inputStyle} />
              </div>
            ))}
            <div>
              <label style={{ fontSize: 10, color: "#555", display: "block", marginBottom: 4 }}>Category</label>
              <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} style={inputStyle}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ fontSize: 10, color: "#555", display: "block", marginBottom: 4 }}>Description</label>
              <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                style={{ ...inputStyle, height: 60, resize: "vertical" }} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <button onClick={saveProduct} disabled={saving} style={{
              background: "#e8620a", border: "none", borderRadius: 6, color: "#fff",
              fontSize: 13, fontWeight: 600, padding: "8px 20px", cursor: "pointer", fontFamily: "inherit", opacity: saving ? 0.6 : 1,
            }}>{saving ? "Saving…" : "Create Product"}</button>
            <button onClick={() => setShowForm(false)} style={{
              background: "none", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6,
              color: "#555", fontSize: 13, padding: "8px 16px", cursor: "pointer", fontFamily: "inherit",
            }}>Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: "#444" }}>Loading…</div>
      ) : tab === "products" ? (
        products.length === 0 ? (
          <div style={{ textAlign: "center", padding: 60, color: "#444" }}>No products yet. Add your first product above.</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
            {products.map(p => (
              <div key={p.id} style={{
                background: "#111", border: `1px solid ${p.is_active ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.03)"}`,
                borderRadius: 10, overflow: "hidden", opacity: p.is_active ? 1 : 0.5,
              }}>
                {p.image_url && (
                  <img src={p.image_url} alt={p.name}
                    style={{ width: "100%", height: 140, objectFit: "cover" }} />
                )}
                <div style={{ padding: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#fff" }}>{p.name}</div>
                    <span style={{ fontSize: 10, padding: "2px 7px", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 20, color: "#888" }}>{p.category}</span>
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#e8620a", marginBottom: 8, fontVariantNumeric: "tabular-nums" }}>
                    {fmt(p.price_paise)}
                    {p.gst_percentage > 0 && <span style={{ fontSize: 11, color: "#555", fontWeight: 400 }}> + {p.gst_percentage}% GST</span>}
                  </div>
                  {p.sku && <div style={{ fontSize: 11, color: "#555", marginBottom: 8, fontFamily: "monospace" }}>SKU: {p.sku}</div>}

                  {/* Variants */}
                  {p.merchandise_variants?.length > 0 && (
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 10, color: "#444", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Variants</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {p.merchandise_variants.map(v => (
                          <div key={v.id} style={{ fontSize: 11, padding: "2px 8px", background: "rgba(255,255,255,0.04)", borderRadius: 4, color: "#888" }}>
                            {v.variant_name}
                            <span style={{ color: v.stock_qty > v.reserved_qty ? "#22c55e" : "#ef4444", marginLeft: 4 }}>
                              ({v.stock_qty - v.reserved_qty})
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <button onClick={() => toggleActive(p.id, p.is_active)} style={{
                    background: "none", border: `1px solid ${p.is_active ? "#ef4444" : "#22c55e"}`,
                    borderRadius: 4, color: p.is_active ? "#ef4444" : "#22c55e",
                    fontSize: 11, padding: "3px 10px", cursor: "pointer", fontFamily: "inherit",
                  }}>{p.is_active ? "Deactivate" : "Activate"}</button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        /* Orders tab */
        orders.length === 0 ? (
          <div style={{ textAlign: "center", padding: 60, color: "#444" }}>No orders yet.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                  {["Customer","Total","Fulfillment","Status","Payment","Date","Action"].map(h => (
                    <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.map(o => (
                  <tr key={o.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    <td style={{ padding: "10px 12px" }}>
                      <div style={{ color: "#ccc", fontWeight: 500 }}>{o.user_name}</div>
                      <div style={{ fontSize: 11, color: "#555" }}>{o.user_email}</div>
                    </td>
                    <td style={{ padding: "10px 12px", color: "#e8620a", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{fmtR(o.total_rupees)}</td>
                    <td style={{ padding: "10px 12px", color: "#666", textTransform: "capitalize" }}>{o.fulfillment_type.replace("_", " ")}</td>
                    <td style={{ padding: "10px 12px" }}>
                      <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, color: STATUS_COLORS[o.status] ?? "#888", border: `1px solid ${STATUS_COLORS[o.status] ?? "#888"}` }}>
                        {o.status}
                      </span>
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <span style={{ fontSize: 11, color: o.payment_status === "paid" ? "#22c55e" : "#f59e0b" }}>{o.payment_status}</span>
                    </td>
                    <td style={{ padding: "10px 12px", color: "#555", fontSize: 11 }}>{o.created_at.slice(0, 10)}</td>
                    <td style={{ padding: "10px 12px" }}>
                      {o.status !== "delivered" && o.status !== "cancelled" && (
                        <select
                          defaultValue={o.status}
                          onChange={e => updateOrderStatus(o.id, e.target.value)}
                          style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 4, color: "#888", fontSize: 11, padding: "2px 6px", fontFamily: "inherit", cursor: "pointer" }}>
                          {["pending","confirmed","packed","dispatched","delivered","cancelled"].map(s => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}
