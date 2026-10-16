"use client";

import { useRef, useState } from "react";
import { ShoppingBag, Plus, Pencil, Trash2, ImagePlus, Eye, EyeOff, ArrowUp, ArrowDown, ChevronsUp } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { ProductImage } from "@/components/shop/product-image";
import { PriceAdvisor } from "@/components/shop/price-advisor";
import { PriceTag, SaleOverlay } from "@/components/shop/price-tag";
import { activeSale, priceWithPercent } from "@/lib/shop-sale";
import { fromTashkentInputValue, toTashkentInputValue } from "@/lib/schedule";
import { saveProductAction, deleteProductAction, moveProductAction, ShopProduct } from "@/actions/shop.actions";
import { uploadFileToStorage } from "@/lib/upload-client";
import { cn, formatNumberUz } from "@/lib/utils";

interface FormState {
  title: string;
  description: string;
  price: string;
  /** Hayotdagi narxi (so'm) — faqat mentor ko'radi */
  realPrice: string;
  /** Vaqtinchalik chegirma */
  saleOn: boolean;
  salePrice: string;
  saleEnds: string; // "2026-10-24T23:59" (Toshkent)
  category: string;
  kind: "item" | "privilege" | "streak_shield";
  stock: string; // bo'sh — cheklanmagan
  isActive: boolean;
  imageKey: string | null;
  imagePreview: string | null;
}

const EMPTY_FORM: FormState = {
  title: "",
  description: "",
  price: "50",
  realPrice: "",
  saleOn: false,
  salePrice: "",
  saleEnds: "",
  category: "",
  kind: "item",
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
      realPrice: p.realPrice ? String(p.realPrice) : "",
      // Tugagan chegirma formada o'chiq ko'rinadi (saqlanganda tozalanadi)
      saleOn: Boolean(activeSale(p)),
      salePrice: activeSale(p) ? String(p.salePrice) : "",
      saleEnds: activeSale(p) && p.saleEndsAt ? toTashkentInputValue(p.saleEndsAt) : "",
      category: p.category || "",
      kind: p.kind ?? "item",
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
          realPrice: form.realPrice.trim() === "" ? null : Number(form.realPrice.replace(/\s/g, "")),
          salePrice: form.saleOn ? Number(form.salePrice) : null,
          saleEndsAt: form.saleOn ? fromTashkentInputValue(form.saleEnds)?.toISOString() ?? null : null,
          category: form.category,
          kind: form.kind,
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

  const [moving, setMoving] = useState(false);

  // Do'kondagi tartib: darhol joyida almashadi, server boshqacha javob bersa — server tartibi olinadi
  const move = async (p: ShopProduct, direction: "up" | "down" | "top") => {
    const before = products;
    const from = before.findIndex((x) => x._id === p._id);
    const to = direction === "up" ? Math.max(0, from - 1) : direction === "down" ? Math.min(before.length - 1, from + 1) : 0;
    if (from < 0 || to === from) return;
    const next = [...before];
    next.splice(to, 0, next.splice(from, 1)[0]);
    setProducts(next);
    setMoving(true);
    try {
      const res = await moveProductAction(p._id, direction);
      if (res.success && res.data) {
        const byId = new Map(next.map((x) => [x._id, x]));
        setProducts(res.data.order.flatMap((id) => byId.get(id) ?? []));
      } else {
        setProducts(before);
        toast.error(res.message || "Tartibni o'zgartirib bo'lmadi");
      }
    } catch {
      setProducts(before);
      toast.error("Tartibni o'zgartirib bo'lmadi");
    } finally {
      setMoving(false);
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
        kind: p.kind,
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((p, index) => (
            <div
              key={p._id}
              className={cn(
                "p-4 rounded-3xl bg-white dark:bg-surface border border-slate-200/80 dark:border-slate-800/80 shadow-xs flex flex-col gap-3 transition-opacity",
                !p.isActive && "opacity-60"
              )}
            >
              <div className="relative">
                <ProductImage src={p.imageUrl} alt={p.title} className="aspect-[4/3] w-full" />
                <SaleOverlay product={p} />
                {/* Do'kondagi joyi: o'quvchilar ham aynan shu tartibda ko'radi */}
                <div className="absolute right-2 top-2 flex items-center gap-1 rounded-xl bg-white/95 dark:bg-slate-900/90 p-1 shadow-md backdrop-blur-sm">
                  {(
                    [
                      ["top", ChevronsUp, "Eng tepaga"],
                      ["up", ArrowUp, "Yuqoriga"],
                      ["down", ArrowDown, "Pastga"],
                    ] as const
                  ).map(([dir, Icon, label]) => (
                    <button
                      key={dir}
                      type="button"
                      onClick={() => void move(p, dir)}
                      disabled={moving || (dir === "down" ? index === products.length - 1 : index === 0)}
                      aria-label={`${p.title}: ${label.toLowerCase()}`}
                      title={label}
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-700 dark:text-slate-200 hover:bg-teal-500/15 hover:text-teal-700 dark:hover:text-teal-300 cursor-pointer disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent"
                    >
                      <Icon className="w-4 h-4" />
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex-1 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 truncate">
                    <span className="mr-1.5 rounded-md bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 font-mono text-slate-700 dark:text-slate-300">#{index + 1}</span>
                    {p.category || "Sovg'a"}
                  </span>
                  <Badge variant={p.isActive ? "success" : "secondary"}>{p.isActive ? "Do'konda" : "Yashirilgan"}</Badge>
                </div>
                <h2 className="font-bold text-slate-900 dark:text-slate-100 leading-snug">{p.title}</h2>
                {p.description && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">{p.description}</p>
                )}
              </div>
              <div className="space-y-2">
                <PriceTag product={p} size="md" />
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                  {p.realPrice ? <span title="Hayotdagi narxi — faqat siz ko'rasiz">≈ {formatNumberUz(p.realPrice)} so&apos;m</span> : null}
                  <span className="font-semibold">{p.stock === null ? "Cheklanmagan" : `${p.stock} ta bor`}</span>
                  <span>{p.buyers} ta o&apos;quvchi olgan</span>
                </div>
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
        <DialogContent className="max-w-md p-4 sm:p-6 max-h-[90dvh] overflow-y-auto">
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

            <Field htmlFor="product-real-price" label="Hayotdagi narxi (so'm)" hint="Faqat siz ko'rasiz — o'quvchilarga ko'rinmaydi">
              <Input
                id="product-real-price"
                type="number"
                inputMode="numeric"
                min={0}
                step={500}
                value={form.realPrice}
                onChange={(e) => setForm({ ...form, realPrice: e.target.value })}
                placeholder="masalan: 25000"
              />
            </Field>

            <PriceAdvisor
              realPrice={form.realPrice.trim() === "" ? null : Number(form.realPrice)}
              productId={editingId}
              currentPrice={Number(form.price)}
              onPick={(price) => setForm((f) => ({ ...f, price: String(price) }))}
            />

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

            {/* Vaqtinchalik chegirma: tugash vaqti o'tgach narx o'zi asliga qaytadi */}
            <div className={cn("space-y-3 rounded-2xl border p-3.5", form.saleOn ? "border-rose-400/50 bg-rose-50/60 dark:bg-rose-500/10" : "border-slate-200 dark:border-slate-800")}>
              <label className="flex cursor-pointer items-center gap-2.5 text-sm font-semibold text-slate-900 dark:text-slate-100 min-h-[36px]">
                <input
                  type="checkbox"
                  checked={form.saleOn}
                  onChange={(e) => {
                    const on = e.target.checked;
                    setForm((f) => {
                      const base = Number(f.price) || 0;
                      // Yoqilganda: 20% chegirma va bir haftadan keyin 23:59 gacha
                      const weekLater = toTashkentInputValue(new Date(Date.now() + 7 * 86_400_000)).slice(0, 10) + "T23:59";
                      return {
                        ...f,
                        saleOn: on,
                        salePrice: on && !f.salePrice && base > 1 ? String(priceWithPercent(base, 20)) : f.salePrice,
                        saleEnds: on && !f.saleEnds ? weekLater : f.saleEnds,
                      };
                    });
                  }}
                  className="h-4 w-4 accent-rose-600"
                />
                Vaqtinchalik chegirma
              </label>

              {form.saleOn && (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    {[10, 20, 30, 50].map((pct) => {
                      const base = Number(form.price) || 0;
                      const value = base > 1 ? priceWithPercent(base, pct) : 0;
                      const active = value > 0 && Number(form.salePrice) === value;
                      return (
                        <button
                          key={pct}
                          type="button"
                          disabled={base <= 1}
                          onClick={() => setForm((f) => ({ ...f, salePrice: String(value) }))}
                          className={cn(
                            "min-h-[36px] rounded-lg px-3 text-xs font-bold transition-colors cursor-pointer disabled:opacity-50",
                            active ? "bg-rose-600 text-white" : "bg-white dark:bg-surface border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-rose-400"
                          )}
                        >
                          −{pct}%
                        </button>
                      );
                    })}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field htmlFor="product-sale-price" label="Chegirma narxi (coin)" required>
                      <Input
                        id="product-sale-price"
                        type="number"
                        min={1}
                        value={form.salePrice}
                        onChange={(e) => setForm({ ...form, salePrice: e.target.value })}
                        required
                      />
                    </Field>
                    <Field htmlFor="product-sale-ends" label="Qachongacha" required>
                      <Input
                        id="product-sale-ends"
                        type="datetime-local"
                        value={form.saleEnds}
                        onChange={(e) => setForm({ ...form, saleEnds: e.target.value })}
                        required
                      />
                    </Field>
                  </div>
                  {Number(form.salePrice) > 0 && Number(form.price) > Number(form.salePrice) && (
                    <p className="text-xs text-rose-700 dark:text-rose-300">
                      O&apos;quvchilar {form.price} o&apos;rniga <strong>{form.salePrice} coin</strong> to&apos;laydi (−
                      {Math.round((1 - Number(form.salePrice) / Number(form.price)) * 100)}%). Chegirma boshlanganda o&apos;quvchilarga xabar boradi.
                    </p>
                  )}
                </>
              )}
            </div>

            <Field
              htmlFor="product-kind"
              label="Turi"
              hint={
                form.kind === "streak_shield"
                  ? "Xarid qilinishi bilan o'quvchiga beriladi (gamifikatsiya yoqilgan bo'lsa)"
                  : form.kind === "privilege"
                    ? "Material bo'lmagan mukofot: mentor bilan 1:1, loyihani proyektorda ko'rsatish..."
                    : undefined
              }
            >
              <Select id="product-kind" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as FormState["kind"] })}>
                <option value="item">Sovg&apos;a</option>
                <option value="privilege">Imtiyoz</option>
                <option value="streak_shield">Seriya himoyasi</option>
              </Select>
            </Field>

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
            <strong>{toDelete?.title}</strong> do&apos;kondan olib tashlanadi va arxivga o&apos;tadi (Sozlamalar → Arxiv bo&apos;limidan
            tiklash mumkin). Agar unga buyurtmalar bo&apos;lsa, tarix saqlanishi uchun mahsulot faqat yashiriladi.
          </p>
        }
      />
    </div>
  );
}
