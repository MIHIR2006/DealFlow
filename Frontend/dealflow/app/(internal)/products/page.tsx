"use client";

import React, { useState } from "react";
import { Package, Warehouse, Plus, Edit2, ShieldAlert } from "lucide-react";
import { useFetch, inr } from "@/lib/hooks";

interface Product {
  id: number;
  sku: string;
  name: string;
  category_id: number;
  category_name: string;
  line_type: string;
  unit_price: string;
  cost_price: string;
  tax_rate_pct: string;
  stock_total: number;
}

interface WarehouseItem {
  id: number;
  code: string;
  name: string;
  shipping_weight: string;
  is_active: boolean;
}

export default function ProductsCatalogPage() {
  const [activeTab, setActiveTab] = useState<"PRODUCTS" | "WAREHOUSES">("PRODUCTS");

  const { data: prodRes, loading: prodLoading } = useFetch<{ data: Product[] }>("/v1/products");
  const products = prodRes?.data ?? [];

  const { data: whRes, loading: whLoading } = useFetch<{ data: WarehouseItem[] }>("/v1/warehouses");
  const warehouses = whRes?.data ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[13px] text-mist font-medium">Catalog &amp; Inventory Management</p>
          <h1 className="font-serif mt-1 text-[32px] tracking-[-0.02em] sm:text-[40px] text-ink">
            Products &amp; Warehouse Network
          </h1>
          <p className="mt-1 text-[14.5px] text-mist max-w-[620px]">
            Configure base list prices, cost accounting, warehouse shipping cost weights, and regional inventory levels.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1 rounded-full bg-white p-1 border border-ink/8 shadow-xs">
          <button
            type="button"
            onClick={() => setActiveTab("PRODUCTS")}
            className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[12.5px] font-semibold transition-colors ${
              activeTab === "PRODUCTS"
                ? "bg-ink text-bone shadow-xs"
                : "text-mist hover:text-ink"
            }`}
          >
            <Package className="size-3.5" /> Product Catalog ({products.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("WAREHOUSES")}
            className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[12.5px] font-semibold transition-colors ${
              activeTab === "WAREHOUSES"
                ? "bg-ink text-bone shadow-xs"
                : "text-mist hover:text-ink"
            }`}
          >
            <Warehouse className="size-3.5" /> Warehouses ({warehouses.length})
          </button>
        </div>
      </div>

      {/* TAB 1: PRODUCT CATALOG */}
      {activeTab === "PRODUCTS" && (
        <div className="overflow-hidden rounded-[24px] bg-white border border-ink/8 shadow-xs">
          <div className="px-6 py-4 border-b border-ink/6 flex items-center justify-between">
            <h2 className="text-[16px] font-semibold text-ink">Active Products &amp; SKUs</h2>
            <span className="text-[12px] font-mono text-mist">
              {products.length} registered SKUs
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13.5px]">
              <thead className="text-[11.5px] font-semibold uppercase tracking-wider text-mist bg-ink/[0.02] border-b border-ink/6">
                <tr>
                  <th className="px-6 py-3.5">SKU &amp; Product</th>
                  <th className="px-6 py-3.5">Category</th>
                  <th className="px-6 py-3.5">Line Type</th>
                  <th className="px-6 py-3.5">Unit Price</th>
                  <th className="px-6 py-3.5">Cost Price</th>
                  <th className="px-6 py-3.5">Tax Rate</th>
                  <th className="px-6 py-3.5 text-right">On-Hand Stock</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {prodLoading && products.length === 0 && (
                  <>
                    {[1, 2, 3].map((i) => (
                      <tr key={i}>
                        <td colSpan={7} className="px-6 py-4">
                          <div className="h-5 w-full rounded bg-ink/5 animate-pulse" />
                        </td>
                      </tr>
                    ))}
                  </>
                )}

                {products.map((p) => (
                  <tr key={p.id} className="hover:bg-cream/40 transition-colors">
                    <td className="px-6 py-4">
                      <p className="font-semibold text-ink">{p.name}</p>
                      <p className="text-[11.5px] font-mono text-mist">{p.sku}</p>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-ink/5 text-ink">
                        {p.category_name}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-mist text-[12px]">
                      {p.line_type}
                    </td>
                    <td className="px-6 py-4 font-mono font-bold tabular-nums text-ink">
                      {inr(p.unit_price)}
                    </td>
                    <td className="px-6 py-4 font-mono tabular-nums text-mist">
                      {inr(p.cost_price)}
                    </td>
                    <td className="px-6 py-4 font-mono text-[12.5px] text-mist">
                      {p.tax_rate_pct}%
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span
                        className={`font-mono font-bold text-[13px] ${
                          p.stock_total <= 5
                            ? "text-rose-700"
                            : "text-emerald-800"
                        }`}
                      >
                        {p.stock_total} units
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: WAREHOUSES */}
      {activeTab === "WAREHOUSES" && (
        <div className="overflow-hidden rounded-[24px] bg-white border border-ink/8 shadow-xs">
          <div className="px-6 py-4 border-b border-ink/6 flex items-center justify-between">
            <h2 className="text-[16px] font-semibold text-ink">Fulfillment Depot Network</h2>
            <span className="text-[12px] font-mono text-mist">
              {warehouses.length} active hubs
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13.5px]">
              <thead className="text-[11.5px] font-semibold uppercase tracking-wider text-mist bg-ink/[0.02] border-b border-ink/6">
                <tr>
                  <th className="px-6 py-3.5">Warehouse Code</th>
                  <th className="px-6 py-3.5">Hub Name</th>
                  <th className="px-6 py-3.5">Shipping Weight (Tie-Break)</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5 text-right">Dispatch Capability</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {whLoading && warehouses.length === 0 && (
                  <>
                    {[1, 2, 3].map((i) => (
                      <tr key={i}>
                        <td colSpan={5} className="px-6 py-4">
                          <div className="h-5 w-full rounded bg-ink/5 animate-pulse" />
                        </td>
                      </tr>
                    ))}
                  </>
                )}

                {warehouses.map((wh) => (
                  <tr key={wh.id} className="hover:bg-cream/40 transition-colors">
                    <td className="px-6 py-4 font-mono font-semibold text-ink">
                      {wh.code}
                    </td>
                    <td className="px-6 py-4">
                      <p className="font-semibold text-ink">{wh.name}</p>
                    </td>
                    <td className="px-6 py-4 font-mono text-[13px] text-ink font-semibold">
                      {wh.shipping_weight}x
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                        {wh.is_active ? "Operational" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right text-mist text-[12.5px]">
                      Full automated split dispatch
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
