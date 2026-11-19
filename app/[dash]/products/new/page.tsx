import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getCategories } from "@/lib/categories";
import { adminHref, requirePage } from "@/lib/staff";
import { ProductEditor } from "@/components/dashboard/product-editor";

export default async function NewProductPage() {
  await requirePage("products");
  const cats = await getCategories(false);
  return (
    <div className="dash-page">
      <Link className="text-link" href={adminHref("products")}>
        <ArrowLeft size={15} /> All products
      </Link>
      <div className="dash-heading">
        <h1>Add a product</h1>
      </div>
      <ProductEditor
        listHref={adminHref("products")}
        categories={cats.map((c) => ({ name: c.name, sizes: c.sizes }))}
        initial={{
          id: "",
          name: "",
          category: cats[0]?.name ?? "",
          gender: "unisex",
          tags: [],
          price: 699,
          originalPrice: 899,
          description: "",
          images: [],
          badge: "",
          color: "#bd9460",
          active: true,
          stock: {},
        }}
      />
    </div>
  );
}
