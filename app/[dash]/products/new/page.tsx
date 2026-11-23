import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getCategories } from "@/lib/categories";
import { MAX_IMAGES } from "@/lib/catalog";
import { adminHref, requirePage } from "@/lib/staff";
import { RowsEditor } from "@/components/dashboard/rows-editor";
import { addProductsAction } from "../../actions";

/** Add one product or many: one row each, saved together. */
export default async function NewProductPage() {
  await requirePage("products");
  const cats = await getCategories(false);
  return (
    <div className="dash-page">
      <Link className="text-link" href={adminHref("products")}>
        <ArrowLeft size={15} /> All products
      </Link>
      <div className="dash-heading">
        <div>
          <h1>Add products</h1>
          <span className="muted">
            One row per product — add one or as many as you like, then save. The first photo is the main one
            in the shop. You can change anything later from the product list.
          </span>
        </div>
      </div>
      <section className="dash-panel">
        <RowsEditor
          action={addProductsAction}
          layout="cards"
          itemLabel="Product"
          addLabel="Add another product"
          saveLabel="Save products"
          defaults={{
            images: "",
            name: "",
            category: cats[0]?.name ?? "",
            gender: "unisex",
            price: "",
            salePrice: "",
            saleStartsAt: "",
            saleEndsAt: "",
            stock: "",
            description: "",
            tags: "",
            badge: "",
            active: true,
          }}
          columns={[
            {
              key: "images",
              label: "Photos",
              type: "image",
              max: MAX_IMAGES,
              required: true,
              hint: `up to ${MAX_IMAGES}`,
            },
            { key: "name", label: "Name", type: "text", required: true, maxLength: 100 },
            {
              key: "category",
              label: "Category",
              type: "select",
              required: true,
              options: cats.map((c) => [c.name, c.name] as [string, string]),
            },
            {
              key: "gender",
              label: "For",
              type: "select",
              options: [
                ["unisex", "Unisex"],
                ["girls", "Girls"],
                ["boys", "Boys"],
              ],
            },
            { key: "price", label: "MRP ₹", type: "number", required: true, min: 1, hint: "normal price" },
            { key: "salePrice", label: "Sale price ₹", type: "number", min: 1, hint: "optional, below MRP" },
            { key: "saleStartsAt", label: "Sale starts", type: "datetime-local", hint: "empty = now" },
            { key: "saleEndsAt", label: "Sale ends", type: "datetime-local", hint: "empty = no end" },
            {
              key: "stock",
              label: "Stock by size",
              type: "counts",
              optionsBy: {
                key: "category",
                map: Object.fromEntries(
                  cats.map((c) => [c.name, c.sizes.map((s) => [s, s] as [string, string])]),
                ),
              },
            },
            { key: "description", label: "Description", type: "text", maxLength: 5000 },
            {
              key: "tags",
              label: "Tags",
              type: "text",
              placeholder: "cotton, summer",
              hint: "comma separated",
            },
            { key: "badge", label: "Badge", type: "text", maxLength: 40, placeholder: "NEW" },
            { key: "active", label: "Visible", type: "check", width: "60px" },
          ]}
        />
      </section>
    </div>
  );
}
