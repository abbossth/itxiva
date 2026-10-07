import { PageHeaderSkeleton, CardGridSkeleton } from "@/components/shared/skeletons";

export default function MentorShopLoading() {
  return (
    <div className="space-y-4" aria-busy="true">
      <PageHeaderSkeleton withAction />
      <CardGridSkeleton count={6} withImage />
    </div>
  );
}
