import { PageHeaderSkeleton, CardGridSkeleton } from "@/components/shared/skeletons";

export default function MentorShopLoading() {
  return (
    <div className="space-y-6 max-w-5xl mx-auto" aria-busy="true">
      <PageHeaderSkeleton withAction />
      <CardGridSkeleton count={6} withImage />
    </div>
  );
}
