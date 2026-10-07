"use client";

import { useRef, useState } from "react";
import { ShoppingBag, Plus, Pencil, Trash2, ImagePlus, Eye, EyeOff } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CoinBadge } from "@/components/ui/coin-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { ProductImage } from "@/components/shop/product-image";
import { saveProductAction, deleteProductAction, ShopProduct } from "@/actions/shop.actions";
import { uploadFileToStorage } from "@/lib/upload-client";
import { cn } from "@/lib/utils";

interface FormState {
  title: string;
  description: string;
  price: string;
  category: string;
  stock: string; // bo'sh — cheklanmagan
  isActive: boolean;
  imageKey: string | null;
  imagePreview: string | null;
}

const EMPTY_FORM: FormState = {
  title: "",
  description: "",
  price: "50",
  category: "",
  stock: "",
  isActive: true,
  imageKey: null,
  imagePreview: null,
};

export function ProductsManager({ initialProducts }: { initialProducts: ShopProduct[] }) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [products, setProducts] = useState(initialProducts);
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<ShopProduct | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setErrorMsg(null);
    setIsOpen(true);
  };

  const openEdit = (p: ShopProduct) => {
    setEditingId(p._id);
    setForm({
      title: p.title,
      description: p.description || "",
      price: String(p.price),
      category: p.category || "",
      stock: p.stock === null ? "" : String(p.stock),
      isActive: p.isActive,
      imageKey: p.imageKey || null,
      imagePreview: p.imageUrl,
    });
    setErrorMsg(null);
    setIsOpen(true);
  };

  const handleImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Faqat rasm fayli yuklang");
      return;
    }
    try {
      setIsUploading(true);
      const uploaded = await uploadFileToStorage(file);
      setForm((f) => ({ ...f, imageKey: uploaded.key, imagePreview: URL.createObjectURL(file) }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Rasmni yuklab bo'lmadi");
    } finally {
      setIsUploading(false);
      e.target.value = "";
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSaving(true);
      setErrorMsg(null);
      const res = await saveProductAction(
        {
          title: form.title,
          description: form.description,
          price: Number(form.price),
          category: form.category,
          stock: form.stock.trim() === "" ? null : Number(form.stock),
          isActive: form.isActive,
          imageKey: form.imageKey,
        },
        editingId ?? undefined
      );
      if (res.success && res.data) {
        const saved = { ...res.data, imageUrl: res.data.imageUrl ?? form.imagePreview };
        setProducts((prev) =>
          editingId ? prev.map((p) => (p._id === editingId ? saved : p)) : [saved, ...prev]
        );
        toast.success(res.message || "Saqlandi");
        setIsOpen(false);
      } else {
        setErrorMsg(res.message || "Saqlashda xatolik");
      }
    } catch {
      setErrorMsg("Kutilmagan xatolik yuz berdi");
    } finally {
      setIsSaving(false);
    }
  };

  const toggleActive = async (p: ShopProduct) => {
    // Optimistik: holat darhol almashadi, xato bo'lsa qaytariladi
    setProducts((prev) => prev.map((x) => (x._id === p._id ? { ...x, isActive: !p.isActive } : x)));
    const res = await saveProductAction(
      {
        title: p.title,
        description: p.description,
        price: p.price,
        category: p.category,
        stock: p.stock,
        imageKey: p.imageKey,
        isActive: !p.isActive,
      },
      p._id
    ).catch(() => ({ success: false as const, message: undefined }));
    if (!res.success) {
      setProducts((prev) => prev.map((x) => (x._id === p._id ? { ...x, isActive: p.isActive } : x)));
      toast.error(res.message || "O'zgartirib bo'lmadi");
    }
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    try {
      setIsDeleting(true);
      const res = await deleteProductAction(toDelete._id);
      if (res.success) {
        const hidden = res.message?.includes("yashirildi");
        setProducts((prev) =>
          hidden
            ? prev.map((p) => (p._id === toDelete._id ? { ...p, isActive: false } : p))
            : prev.filter((p) => p._id !== toDelete._id)
        );
        toast.success(res.message || "O'chirildi");
        setToDelete(null);
      } else {
        toast.error(res.message || "O'chirib bo'lmadi");
      }
    } catch {
      toast.error("O'chirishda xatolik");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-4 pb-12">
      <PageHeader
        icon={ShoppingBag}
        title="Do'kon mahsulotlari"
        subtitle="O'quvchilar coin evaziga buyurtma qila oladigan sovg'a va imtiyozlar"
        actions={
          <Button variant="primary" onClick={openCreate} className="gap-2">
            <Plus className="w-4 h-4" />
            Mahsulot qo&apos;shish
          </Button>
        }
      />

      {products.length === 0 ? (
        <EmptyState
          icon={ShoppingBag}
          title="Hali mahsulot qo'shilmagan"
          description="Birinchi sovg'ani qo'shing — o'quvchilar uni do'konda ko'radi"
          action={
            <Button variant="primary" onClick={openCreate} className="gap-2">
              <Plus className="w-4 h-4" />
              Mahsulot qo&apos;shish
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((p) => (
            <div
              key={p._id}
              className={cn(
                "p-4 rounded-3xl bg-white dark:bg-surface border border-slate-200/80 dark:border-slate-800/80 shadow-xs flex flex-col gap-3 transition-opacity",
                !p.isActive && "opacity-60"
              )}
            >
              <ProductImage src={p.imageUrl} alt={p.title} className="aspect-[4/3] w-full" />
              <div className="flex-1 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 truncate">
                    {p.category || "Sovg'a"}
                  </span>
                  <Badge variant={p.isActive ? "success" : "secondary"}>{p.isActive ? "Do'konda" : "Yashirilgan"}</Badge>
                </div>
                <h2 className="font-bold text-slate-900 dark:text-slate-100 leading-snug">{p.title}</h2>
                {p.description && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">{p.description}</p>
                )}
              </div>
              <div className="flex items-center justify-between">
                <CoinBadge amount={p.price} size="sm" animate={false} />
                <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  {p.stock === null ? "Cheklanmagan" : `${p.stock} ta bor`}
                </span>
              </div>
              <div className="flex items-center gap-1 pt-2 border-t border-slate-100 dark:border-slate-800">
                <Button variant="ghost" size="sm" onClick={() => openEdit(p)} className="gap-1.5 flex-1 min-h-[44px]">
                  <Pencil className="w-4 h-4" />
                  Tahrirlash
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => toggleActive(p)}
                  aria-label={p.isActive ? "Do'kondan yashirish" : "Do'konda ko'rsatish"}
                  title={p.isActive ? "Do'kondan yashirish" : "Do'konda ko'rsatish"}
                >
                  {p.isActive ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setToDelete(p)}
                  aria-label={`${p.title} mahsulotini o'chirish`}
                  className="text-rose-600 dark:text-rose-400"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-md p-6 max-h-[90dvh] overflow-y-auto">
          <DialogHeader className="space-y-1 mb-4">
            <DialogTitle>{editingId ? "Mahsulotni tahrirlash" : "Yangi mahsulot"}</DialogTitle>
            <DialogDescription>Nom, narx va (ixtiyoriy) rasmini kiriting</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSave} className="space-y-4">
            {errorMsg && (
              <div className="p-3 text-xs rounded-xl bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200 dark:border-rose-900">
                {errorMsg}
              </div>
            )}

            <div className="flex items-center gap-3">
              <ProductImage src={form.imagePreview} alt="Mahsulot rasmi" className="w-24 h-20 shrink-0" />
              <div className="space-y-1">
                <input ref={fileRef} type="file" accept="image/*" onChange={handleImage} className="hidden" />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  isLoading={isUploading}
                  onClick={() => fileRef.current?.click()}
                  className="gap-1.5 min-h-[44px]"
                >
                  <ImagePlus className="w-4 h-4" />
                  {form.imageKey ? "Rasmni almashtirish" : "Rasm yuklash"}
                </Button>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Ixtiyoriy. Rasm avtomatik siqiladi.</p>
              </div>
            </div>

            <Field htmlFor="product-title" label="Nomi" required>
              <Input
                id="product-title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="masalan: ITXiva stikerlar to'plami"
                maxLength={80}
                required
              />
            </Field>

            <Field htmlFor="product-desc" label="Tavsif">
              <Textarea
                id="product-desc"
                rows={3}
                maxLength={500}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field htmlFor="product-price" label="Narxi (coin)" required>
                <Input
                  id="product-price"
                  type="number"
                  min={1}
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                  required
                />
              </Field>
              <Field htmlFor="product-stock" label="Soni" hint="Bo'sh — cheklanmagan">
                <Input
                  id="product-stock"
                  type="number"
                  min={0}
                  value={form.stock}
                  onChange={(e) => setForm({ ...form, stock: e.target.value })}
                  placeholder="∞"
                />
              </Field>
            </div>

            <Field htmlFor="product-category" label="Turkum" hint="Masalan: Merch, Imtiyoz, Kiyim">
              <Input
                id="product-category"
                value={form.category}
                maxLength={30}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              />
            </Field>

            <label className="flex items-center gap-2.5 text-sm text-slate-800 dark:text-slate-200 cursor-pointer min-h-[44px]">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                className="accent-teal-600 w-4 h-4"
              />
              Do&apos;konda o&apos;quvchilarga ko&apos;rsatish
            </label>

            <DialogFooter className="pt-2">
              <Button type="button" variant="secondary" onClick={() => setIsOpen(false)} disabled={isSaving}>
                Bekor qilish
              </Button>
              <Button type="submit" variant="primary" isLoading={isSaving} disabled={isUploading}>
                Saqlash
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        isOpen={Boolean(toDelete)}
        onClose={() => setToDelete(null)}
        onConfirm={handleDelete}
        title="Mahsulotni o'chirish"
        danger
        confirmText="Ha, o'chirish"
        isLoading={isDeleting}
        description={
          <p className="text-xs text-slate-600 dark:text-slate-300">
            <strong>{toDelete?.title}</strong> do&apos;kondan olib tashlanadi. Agar unga buyurtmalar bo&apos;lsa, tarix
            saqlanishi uchun mahsulot o&apos;chirilmaydi, faqat yashiriladi.
          </p>
        }
      />
    </div>
  );
}
