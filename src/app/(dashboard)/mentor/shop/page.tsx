import { requireMentorPage } from "@/lib/auth/guards";
import { getProducts } from "@/actions/shop.actions";
import { ProductsManager } from "@/components/shop/products-manager";

export const metadata = {
  title: "Do'kon mahsulotlari — ITXiva",
};

export default async function MentorShopPage() {
  await requireMentorPage();
  const products = await getProducts();
  return <ProductsManager initialProducts={products} />;
}
