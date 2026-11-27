import { SectionNav } from "@/components/dashboard/section-nav";
import { listCategoriesWithCounts } from "@/lib/admin/catalog";
import { DEFAULT_SIZES } from "@/lib/catalog";
import { can, requirePage } from "@/lib/staff";
import { ActionForm } from "@/components/dashboard/action-form";
import { BulkBar, BulkCheck } from "@/components/dashboard/bulk-bar";
import { RowsEditor } from "@/components/dashboard/rows-editor";
import {
  addCategoriesAction,
  bulkCategoriesAction,
  deleteCategoryAction,
  saveCategoryAction,
} from "../actions";

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
  const staff = await requirePage("categories");
  const canDelete = can(staff, "delete_categories");
  const cats = await listCategoriesWithCounts();
  return (
    <div className="dash-page">
      <div className="dash-heading">
        <div>
          <h1>Categories</h1>
          <span className="muted">
            Each category sets its own sizes. Renaming a category updates its products automatically. Edit
            several, then press “Save all” at the bottom.
          </span>
        </div>
      </div>

      <SectionNav
        items={[
          { id: "add", label: "Add categories" },
          ...cats.map((c) => ({ id: `cat-${c.id}`, label: c.name })),
        ]}
      />

      <section className="dash-panel highlight" id="add">
        <h2>Add categories</h2>
        <p className="muted">Add as many rows as you need, then save them all at once.</p>
        <RowsEditor
          action={addCategoriesAction}
          addLabel="Add another category"
          saveLabel="Save all categories"
          defaults={{
            name: "",
            sizes: DEFAULT_SIZES.join(", "),
            description: "",
            sortOrder: "0",
            active: true,
          }}
          columns={[
            { key: "name", label: "Name", type: "text", required: true, maxLength: 60 },
            { key: "sizes", label: "Sizes (comma separated)", type: "text", required: true, width: "26%" },
            { key: "description", label: "Short description", type: "text", maxLength: 200 },
            { key: "sortOrder", label: "Order", type: "number", min: 0, max: 999, width: "80px" },
            { key: "active", label: "Show", type: "check", width: "60px" },
          ]}
        />
      </section>

      <BulkBar
        id="categories-bulk"
        action={bulkCategoriesAction}
        noun="category"
        ops={[
          { op: "show", label: "Show in shop" },
          { op: "hide", label: "Hide" },
          {
            op: "delete",
            label: canDelete ? "Delete" : "Request deletion",
            danger: true,
            confirm: canDelete
              ? "Delete {n} categories? Only empty ones can be deleted."
              : "Ask an admin to delete {n} categories?",
          },
        ]}
        fields={canDelete ? [] : [{ name: "reason", label: "Reason (for delete requests)" }]}
      />

      <div className="dash-grid">
        {cats.map((c) => (
          <section key={c.id} className="dash-panel" id={`cat-${c.id}`}>
            <h2>
              <BulkCheck form="categories-bulk" value={c.id} label={`Select ${c.name}`} /> {c.name}{" "}
              <small className="muted">· {c.products} products</small>{" "}
              {!c.active && <span className="status-pill out">Hidden</span>}
            </h2>
            <ActionForm action={saveCategoryAction} saveAll>
              <CategoryFields c={c} />
              <button className="outline">Save</button>
            </ActionForm>
            {c.products === 0 &&
              (canDelete ? (
                <ActionForm action={deleteCategoryAction} confirm={`Delete the category “${c.name}”?`}>
                  <input type="hidden" name="id" value={c.id} />
                  <button className="text-link danger">Delete category</button>
                </ActionForm>
              ) : (
                <details className="request-delete">
                  <summary className="text-link">Request deletion</summary>
                  <ActionForm action={deleteCategoryAction}>
                    <input type="hidden" name="id" value={c.id} />
                    <label>
                      Reason
                      <input name="reason" maxLength={500} required />
                    </label>
                    <small className="muted">
                      An admin will review it. You can hide the category meanwhile.
                    </small>
                    <button className="outline">Send delete request</button>
                  </ActionForm>
                </details>
              ))}
          </section>
        ))}
      </div>
    </div>
  );
}
