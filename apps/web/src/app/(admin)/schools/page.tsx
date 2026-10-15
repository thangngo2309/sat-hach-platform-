import { Suspense } from "react";
import { CatalogPage } from "@/components/catalog/CatalogPage";

export default function SchoolsPage() {
  return (
    <Suspense fallback={<div>Đang tải danh sách trường...</div>}>
      <CatalogPage section="schools" />
    </Suspense>
  );
}
