import { ListSkeleton, PageHeaderSkeleton, StatTilesSkeleton } from "@/components/shared/skeletons";

export default function MentorQuestsLoading() {
  return (
    <div className="space-y-5" aria-busy="true">
      <PageHeaderSkeleton withAction />
      <StatTilesSkeleton count={4} className="grid-cols-2 lg:grid-cols-4" />
      <ListSkeleton rows={6} withAvatar={false} />
    </div>
  );
}
