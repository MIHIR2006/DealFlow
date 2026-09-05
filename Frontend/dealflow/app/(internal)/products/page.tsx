"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { Package, Warehouse as WarehouseIcon, Plus, X, AlertCircle } from "lucide-react";
import { useFetch, useAuth, inr } from "@/lib/hooks";
import { ConfigApi } from "@/lib/api";
import type { Category, Page, Product, ProductInput, Warehouse } from "@/lib/types";

const EMPTY_PRODUCT: ProductInput = {
  category_id: 0,
  sku: "",
  name: "",
  description: "",
  unit: "unit",
  unit_price: "",
  unit_cost: "",
  tax_rate_pct: "18",
  is_promoted: false,
  is_subscription: false,
  is_active: true,
};

export default function ProductsCatalogPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";

  const [activeTab, setActiveTab] = useState<"PRODUCTS" | "WAREHOUSES">("PRODUCTS");
  const [search, setSearch] = useState("");
  const [categoryTab, setCategoryTab] = useState<"ALL" | number>("ALL");
  const [showAddProduct, setShowAddProduct] = useState(false);

  const categories = useFetch<Page<Category>>("/v1/categories");
  const products = useFetch<Page<Product>>("/v1/products?limit=100");
  const warehouses = useFetch<Page<Warehouse>>("/v1/warehouses");

  const filteredProducts = useMemo(() => {
    const rows = products.data?.data ?? [];
    return rows.filter((p) => {
      const matchSearch =
        !search ||
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.sku.toLowerCase().includes(search.toLowerCase());
      const matchCategory = categoryTab === "ALL" || p.category_id === categoryTab;
      return matchSearch && matchCategory;
    });
  }, [products.data, search, categoryTab]);

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
            {isAdmin
              ? "Configure base list prices, cost accounting, warehouse shipping cost weights, and regional inventory levels."
              : "Browse the live product catalogue and warehouse network. Catalogue edits are restricted to Admins."}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Tab Switcher */}
          <div className="flex items-center gap-1 rounded-full bg-white p-1 card-shadow">
            <button
              type="button"
              onClick={() => setActiveTab("PRODUCTS")}
              className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[12.5px] font-semibold transition-colors ${
                activeTab === "PRODUCTS" ? "bg-ink text-bone" : "text-mist hover:text-ink"
              }`}
            >
              <Package className="size-3.5" /> Product Catalog ({products.data?.data.length ?? 0})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("WAREHOUSES")}
              className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[12.5px] font-semibold transition-colors ${
                activeTab === "WAREHOUSES" ? "bg-ink text-bone" : "text-mist hover:text-ink"
              }`}
            >
              <WarehouseIcon className="size-3.5" /> Warehouses ({warehouses.data?.data.length ?? 0})
            </button>
          </div>

          {isAdmin && activeTab === "PRODUCTS" && (
            <button
              type="button"
              onClick={() => setShowAddProduct(true)}
              className="inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-[12.5px] font-semibold text-bone hover:bg-ink/90 transition-colors shadow-sm"
            >
              <Plus className="size-3.5" /> Add Product
            </button>
          )}
        </div>
      </div>

      {(products.error || categories.error) && (
        <div className="rounded-[18px] tone-bad p-4 text-[13px] font-medium flex items-center gap-2.5">
          <AlertCircle className="size-4 shrink-0" />
          {products.error?.message ?? categories.error?.message ?? "Failed to load catalogue."}
        </div>
      )}

      {/* TAB 1: PRODUCT CATALOG */}
      {activeTab === "PRODUCTS" && (
        <>
          <div className="flex flex-wrap items-center gap-2.5">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or SKU..."
              className="w-64 rounded-full bg-white px-4 py-2 text-[12.5px] border border-ink/10 focus:outline-hidden"
            />
            <div className="flex items-center gap-1 overflow-x-auto">
              <button
                type="button"
                onClick={() => setCategoryTab("ALL")}
                className={`rounded-full px-3 py-1.5 text-[11.5px] font-medium whitespace-nowrap transition-colors ${
                  categoryTab === "ALL" ? "bg-ink text-bone" : "bg-white text-mist hover:text-ink border border-ink/10"
                }`}
              >
                All Categories
              </button>
              {(categories.data?.data ?? []).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategoryTab(c.id)}
                  className={`rounded-full px-3 py-1.5 text-[11.5px] font-medium whitespace-nowrap transition-colors ${
                    categoryTab === c.id ? "bg-ink text-bone" : "bg-white text-mist hover:text-ink border border-ink/10"
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-hidden rounded-[24px] bg-white card-shadow">
            <table className="w-full text-left text-[13.5px]">
              <thead className="text-[11.5px] font-semibold text-mist bg-cream/50 border-b border-ink/6">
                <tr>
                  <th className="px-6 py-3.5">SKU &amp; Product</th>
                  <th className="px-6 py-3.5">Category</th>
                  <th className="px-6 py-3.5">List Price</th>
                  <th className="px-6 py-3.5">Base Cost</th>
                  <th className="px-6 py-3.5">Tax Rate</th>
                  <th className="px-6 py-3.5">Flags</th>
                  <th className="px-6 py-3.5 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {filteredProducts.map((p) => (
                  <tr key={p.id} className="hover:bg-cream/40 transition-colors">
                    <td className="px-6 py-4">
                      <Link href={`/products/${p.id}`} className="font-semibold text-ink hover:underline">
                        {p.name}
                      </Link>
                      <p className="text-[11px] text-mist">{p.sku}</p>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-ink/5 text-mist">
                        {p.category_name ?? p.category_id}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-semibold tabular-nums text-ink">{inr(p.unit_price)}</td>
                    <td className="px-6 py-4 tabular-nums text-mist">{inr(p.unit_cost)}</td>
                    <td className="px-6 py-4 tabular-nums text-mist">{p.tax_rate_pct}%</td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        {p.is_promoted && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded tone-warn">Promoted</span>
                        )}
                        {p.is_subscription && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-ink/5 text-mist">Subscription</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                          p.is_active ? "tone-ok text-ok" : "tone-bad text-bad"
                        }`}
                      >
                        {p.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                  </tr>
                ))}

                {!products.loading && filteredProducts.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-mist">
                      No products match this filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* TAB 2: WAREHOUSES */}
      {activeTab === "WAREHOUSES" && (
        <WarehousesPanel warehouses={warehouses.data?.data ?? []} isAdmin={isAdmin} onCreated={warehouses.refetch} />
      )}

      {showAddProduct && (
        <AddProductModal
          categories={categories.data?.data ?? []}
          onClose={() => setShowAddProduct(false)}
          onCreated={() => {
            setShowAddProduct(false);
            products.refetch();
          }}
          onCategoryCreated={categories.refetch}
        />
      )}
    </div>
  );
}

function AddProductModal({
  categories,
  onClose,
  onCreated,
  onCategoryCreated,
}: {
  categories: Category[];
  onClose: () => void;
  onCreated: () => void;
  onCategoryCreated: () => void;
}) {
  const [form, setForm] = useState<ProductInput>(EMPTY_PRODUCT);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof ProductInput>(key: K, value: ProductInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleCreateCategory() {
    if (!newCategoryName.trim()) return;
    try {
      const created = await ConfigApi.createCategory(newCategoryName.trim());
      onCategoryCreated();
      set("category_id", created.id);
      setNewCategoryName("");
      setShowNewCategory(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create category");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.category_id) {
      setError("Choose a category (or add one).");
      return;
    }
    setSaving(true);
    try {
      await ConfigApi.createProduct(form);
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create product");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
      <div className="w-full max-w-[560px] max-h-[90vh] overflow-y-auto rounded-[24px] bg-white p-6 card-shadow">
        <div className="flex items-center justify-between pb-3 border-b border-ink/6">
          <h2 className="text-[16px] font-semibold text-ink">Add Product</h2>
          <button type="button" onClick={onClose} className="text-mist hover:text-ink">
            <X className="size-4" />
          </button>
        </div>

        {error && (
          <div className="mt-3 rounded-lg tone-bad p-2.5 text-[12px] font-medium">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <div>
            <label className="text-[11.5px] font-medium text-mist">Category</label>
            {!showNewCategory ? (
              <div className="mt-1 flex items-center gap-2">
                <select
                  value={form.category_id || ""}
                  onChange={(e) => set("category_id", Number(e.target.value))}
                  className="flex-1 rounded-lg border border-ink/15 bg-white px-3 py-2 text-[13px]"
                >
                  <option value="">Select category&hellip;</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setShowNewCategory(true)}
                  className="text-[11.5px] font-semibold text-ink whitespace-nowrap hover:underline"
                >
                  + New
                </button>
              </div>
            ) : (
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="New category name"
                  className="flex-1 rounded-lg border border-ink/15 bg-white px-3 py-2 text-[13px]"
                />
                <button
                  type="button"
                  onClick={handleCreateCategory}
                  className="rounded-lg bg-ink px-3 py-2 text-[12px] font-semibold text-bone"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setShowNewCategory(false)}
                  className="text-[11.5px] text-mist hover:text-ink"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11.5px] font-medium text-mist">SKU</label>
              <input
                type="text"
                required
                value={form.sku}
                onChange={(e) => set("sku", e.target.value)}
                className="mt-1 w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-[13px]"
              />
            </div>
            <div>
              <label className="text-[11.5px] font-medium text-mist">Unit</label>
              <input
                type="text"
                value={form.unit}
                onChange={(e) => set("unit", e.target.value)}
                className="mt-1 w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-[13px]"
              />
            </div>
          </div>

          <div>
            <label className="text-[11.5px] font-medium text-mist">Name</label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-[13px]"
            />
          </div>

          <div>
            <label className="text-[11.5px] font-medium text-mist">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-[13px]"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[11.5px] font-medium text-mist">Unit Price (&#8377;)</label>
              <input
                type="text"
                inputMode="decimal"
                required
                value={form.unit_price}
                onChange={(e) => set("unit_price", e.target.value)}
                className="mt-1 w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-[13px] tabular-nums"
              />
            </div>
            <div>
              <label className="text-[11.5px] font-medium text-mist">Unit Cost (&#8377;)</label>
              <input
                type="text"
                inputMode="decimal"
                required
                value={form.unit_cost}
                onChange={(e) => set("unit_cost", e.target.value)}
                className="mt-1 w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-[13px] tabular-nums"
              />
            </div>
            <div>
              <label className="text-[11.5px] font-medium text-mist">Tax Rate (%)</label>
              <input
                type="text"
                inputMode="decimal"
                value={form.tax_rate_pct}
                onChange={(e) => set("tax_rate_pct", e.target.value)}
                className="mt-1 w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-[13px] tabular-nums"
              />
            </div>
          </div>

          <div className="flex items-center gap-4 pt-1">
            <label className="flex items-center gap-1.5 text-[12.5px] text-ink">
              <input
                type="checkbox"
                checked={form.is_promoted}
                onChange={(e) => set("is_promoted", e.target.checked)}
              />
              Promoted
            </label>
            <label className="flex items-center gap-1.5 text-[12.5px] text-ink">
              <input
                type="checkbox"
                checked={form.is_subscription}
                onChange={(e) => set("is_subscription", e.target.checked)}
              />
              Subscription
            </label>
            <label className="flex items-center gap-1.5 text-[12.5px] text-ink">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => set("is_active", e.target.checked)}
              />
              Active
            </label>
          </div>

          <div className="pt-3 flex items-center justify-end gap-2 border-t border-ink/6">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full px-4 py-2 text-[12.5px] font-medium text-mist hover:text-ink"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-full bg-ink px-5 py-2 text-[12.5px] font-semibold text-bone hover:bg-ink/90 disabled:opacity-50"
            >
              {saving ? "Creating..." : "Create Product"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function WarehousesPanel({
  warehouses,
  isAdmin,
  onCreated,
}: {
  warehouses: Warehouse[];
  isAdmin: boolean;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [weight, setWeight] = useState("1.0");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await ConfigApi.createWarehouse(name.trim(), weight || undefined);
      setName("");
      setWeight("1.0");
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create warehouse");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {isAdmin && (
        <form
          onSubmit={handleCreate}
          className="flex flex-wrap items-end gap-3 rounded-[20px] bg-white p-4 card-shadow"
        >
          <div>
            <label className="text-[11.5px] font-medium text-mist">Warehouse name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. South Central Hub (Bengaluru)"
              className="mt-1 w-64 rounded-lg border border-ink/15 bg-white px-3 py-2 text-[13px]"
            />
          </div>
          <div>
            <label className="text-[11.5px] font-medium text-mist">Shipping cost weight</label>
            <input
              type="text"
              inputMode="decimal"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              className="mt-1 w-28 rounded-lg border border-ink/15 bg-white px-3 py-2 text-[13px] tabular-nums"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-[12.5px] font-semibold text-bone hover:bg-ink/90 disabled:opacity-50"
          >
            <Plus className="size-3.5" /> {saving ? "Adding..." : "Add Warehouse"}
          </button>
          {error && <p className="text-[12px] text-bad basis-full">{error}</p>}
        </form>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {warehouses.map((wh) => (
          <div key={wh.id} className="rounded-[24px] bg-white p-6 card-shadow flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-ink/6">
                <span className="text-[12px] font-bold text-ink">#{wh.id}</span>
                <span
                  className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                    wh.is_active ? "tone-ok text-ok" : "tone-bad text-bad"
                  }`}
                >
                  {wh.is_active ? "Online" : "Inactive"}
                </span>
              </div>

              <h3 className="font-semibold text-[15px] text-ink mt-3">{wh.name}</h3>

              <div className="mt-4 space-y-2 text-[12.5px] pt-3 border-t border-ink/6">
                <div className="flex justify-between">
                  <span className="text-mist">Shipping Cost Scalar:</span>
                  <span className="font-bold text-ink">{wh.shipping_cost_weight}x</span>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-3 border-t border-ink/6 text-[11.5px] text-mist text-center">
              Used in greedy set-cover split optimization
            </div>
          </div>
        ))}

        {warehouses.length === 0 && (
          <div className="col-span-full rounded-[24px] border border-dashed border-ink/15 p-10 text-center text-mist">
            No warehouses configured yet.
          </div>
        )}
      </div>
    </div>
  );
}
