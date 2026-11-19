import { listCategoriesWithCounts } from "@/lib/admin/catalog";
import { DEFAULT_SIZES } from "@/lib/catalog";
import { requirePage } from "@/lib/staff";
import { ActionForm } from "@/components/dashboard/action-form";
import { deleteCategoryAction, saveCategoryAction } from "../actions";

type Cat = Awaited<ReturnType<typeof listCategoriesWithCounts>>[number];

function CategoryFields({ c }: { c?: Cat }) {
  return (
    <div className="form-grid">
      {c && <input type="hidden" name="id" value={c.id} />}
      <label>
        Name
        <input name="name" required minLength={2} maxLength={60} defaultValue={c?.name} />
      </label>
      <label>
        Sizes (comma separated, in order)
        <input
          name="sizes"
          required
          defaultValue={(c?.sizes ?? DEFAULT_SIZES).join(", ")}
          placeholder="2-3Y, 3-4Y, 4-5Y"
        />
      </label>
      <label className="wide">
        Short description (shown on the home page banner)
        <input name="description" maxLength={200} defaultValue={c?.description} />
      </label>
      <label>
        Display order
        <input name="sortOrder" type="number" min={0} max={999} defaultValue={c?.sortOrder ?? 0} />
      </label>
      <label className="check">
        <input type="checkbox" name="active" defaultChecked={c?.active ?? true} /> Show in the shop
      </label>
      <input type="hidden" name="image" value={c?.image ?? ""} />
    </div>
  );
}

export default async function CategoriesPage() {
  await requirePage("categories");
  const cats = await listCategoriesWithCounts();
  return (
    <div className="dash-page">
      <div className="dash-heading">
        <div>
          <h1>Categories</h1>
          <span className="muted">
            Each category sets its own sizes. Renaming a category updates its products automatically.
          </span>
        </div>
      </div>
      <div className="dash-grid">
        {cats.map((c) => (
          <section key={c.id} className="dash-panel">
            <h2>
              {c.name} <small className="muted">· {c.products} products</small>{" "}
              {!c.active && <span className="status-pill out">Hidden</span>}
            </h2>
            <ActionForm action={saveCategoryAction}>
              <CategoryFields c={c} />
              <button className="outline">Save</button>
            </ActionForm>
            {c.products === 0 && (
              <ActionForm action={deleteCategoryAction} confirm={`Delete the category “${c.name}”?`}>
                <input type="hidden" name="id" value={c.id} />
                <button className="text-link danger">Delete category</button>
              </ActionForm>
            )}
          </section>
        ))}
        <section className="dash-panel highlight">
          <h2>Add a category</h2>
          <ActionForm action={saveCategoryAction} resetOnSuccess>
            <CategoryFields />
            <button className="primary">Add category</button>
          </ActionForm>
        </section>
      </div>
    </div>
  );
}
