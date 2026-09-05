"use client";

import React, { useState } from "react";
import { Package, Warehouse, Plus, Edit2, ShieldAlert } from "lucide-react";

export default function ProductsCatalogPage() {
  const [activeTab, setActiveTab] = useState<"PRODUCTS" | "WAREHOUSES">("PRODUCTS");

  const [products] = useState([
    {
      id: 1,
      sku: "HW-LP-16",
      name: "Laptop Pro 16\"",
      category: "Hardware",
      unitPrice: "₹2,20,000",
      costPrice: "₹1,55,000",
      margin: "29.5%",
      tax: "18%",
      stock: 54,
    },
    {
      id: 2,
      sku: "SRV-SETUP-PRO",
      name: "Setup & Migration Service",
      category: "Service",
      unitPrice: "₹45,000",
      costPrice: "₹38,000",
      margin: "15.5%",
      tax: "18%",
      stock: 999,
    },
    {
      id: 3,
      sku: "SUB-CLOUD-247",
      name: "Enterprise Cloud Support 24/7",
      category: "Subscription",
      unitPrice: "₹25,000/mo",
      costPrice: "₹8,000/mo",
      margin: "68.0%",
      tax: "18%",
      stock: 999,
    },
    {
      id: 4,
      sku: "HW-SRV-2U",
      name: "Server Rack Unit 2U",
      category: "Hardware",
      unitPrice: "₹1,80,000",
      costPrice: "₹1,30,000",
      margin: "27.8%",
      tax: "18%",
      stock: 4,
    },
    {
      id: 5,
      sku: "HW-DOCK-4K",
      name: "Docking Station Ultra Dual-4K",
      category: "Hardware",
      unitPrice: "₹18,500",
      costPrice: "₹11,000",
      margin: "40.5%",
      tax: "18%",
      stock: 0,
    },
  ]);

  const [warehouses] = useState([
    {
      id: "wh_1",
      name: "Main Warehouse (Mumbai Depot)",
      code: "BOM-01",
      location: "Bhiwandi, Mumbai",
      stockUtilization: "84%",
      shippingWeight: 1.0,
      replenishment: "Automated Reorder (Min 20)",
    },
    {
      id: "wh_2",
      name: "East Depot (Kolkata Hub)",
      code: "CCU-01",
      location: "Dankuni, Kolkata",
      stockUtilization: "61%",
      shippingWeight: 1.4,
      replenishment: "Manual Batch Transfer",
    },
    {
      id: "wh_3",
      name: "South Central Hub (Bengaluru)",
      code: "BLR-01",
      location: "Peenya, Bengaluru",
      stockUtilization: "72%",
      shippingWeight: 1.2,
      replenishment: "Automated Reorder (Min 10)",
    },
  ]);

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
            <Package className="size-3.5" /> Product Catalog (5)
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
            <Warehouse className="size-3.5" /> Warehouses (3)
          </button>
        </div>
      </div>

      {/* TAB 1: PRODUCT CATALOG */}
      {activeTab === "PRODUCTS" && (
        <div className="overflow-hidden rounded-[24px] bg-white border border-ink/8 shadow-xs">
          <table className="w-full text-left text-[13.5px]">
            <thead className="text-[11.5px] font-semibold uppercase tracking-wider text-mist bg-ink/[0.02] border-b border-ink/6">
              <tr>
                <th className="px-6 py-3.5">SKU &amp; Product</th>
                <th className="px-6 py-3.5">Category</th>
                <th className="px-6 py-3.5">List Price</th>
                <th className="px-6 py-3.5">Base Cost</th>
                <th className="px-6 py-3.5">Standard Margin</th>
                <th className="px-6 py-3.5">Network Stock</th>
                <th className="px-6 py-3.5 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {products.map((p) => (
                <tr key={p.id} className="hover:bg-cream/40 transition-colors">
                  <td className="px-6 py-4">
                    <p className="font-semibold text-ink">{p.name}</p>
                    <p className="font-mono text-[11px] text-mist">{p.sku}</p>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-ink/5 text-mist">
                      {p.category}
                    </span>
                  </td>
                  <td className="px-6 py-4 font-mono font-semibold tabular-nums text-ink">
                    {p.unitPrice}
                  </td>
                  <td className="px-6 py-4 font-mono tabular-nums text-mist">
                    {p.costPrice}
                  </td>
                  <td className="px-6 py-4 font-mono font-bold text-emerald-800 tabular-nums">
                    {p.margin}
                  </td>
                  <td className="px-6 py-4 font-mono tabular-nums">
                    {p.stock === 0 ? (
                      <span className="text-rose-700 font-bold">0 units (Backorder)</span>
                    ) : p.stock === 999 ? (
                      <span className="text-mist">Infinite / Virtual</span>
                    ) : (
                      <span className="text-ink font-semibold">{p.stock} units</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800">
                      Active
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 2: WAREHOUSES & REPLENISHMENT */}
      {activeTab === "WAREHOUSES" && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {warehouses.map((wh) => (
            <div
              key={wh.id}
              className="rounded-[24px] bg-white p-6 border border-ink/8 shadow-xs flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-ink/6">
                  <span className="font-mono text-[12px] font-bold text-ink">
                    {wh.code}
                  </span>
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                    Online
                  </span>
                </div>

                <h3 className="font-semibold text-[15px] text-ink mt-3">
                  {wh.name}
                </h3>
                <p className="text-[12px] text-mist mt-0.5">{wh.location}</p>

                <div className="mt-4 space-y-2 text-[12.5px] pt-3 border-t border-ink/6">
                  <div className="flex justify-between">
                    <span className="text-mist">Shipping Cost Scalar:</span>
                    <span className="font-mono font-bold text-ink">
                      {wh.shippingWeight.toFixed(1)}x
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-mist">Depot Capacity:</span>
                    <span className="font-mono text-ink font-medium">
                      {wh.stockUtilization}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-mist">Replenishment Rule:</span>
                    <span className="text-ink font-medium text-[11.5px]">
                      {wh.replenishment}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-3 border-t border-ink/6 text-[11.5px] text-mist text-center">
                Used in greedy set-cover split optimization
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
