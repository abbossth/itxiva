import { requireAuth } from "@/lib/auth/guards";
import { connectToDatabase } from "@/lib/db/connect";
import { User } from "@/lib/db/models/user.model";
import { Group } from "@/lib/db/models/group.model";
import { ProfileView } from "@/components/profile/profile-view";

export const metadata = {
  title: "Mening profilim — ITXiva",
};

export default async function ProfilePage() {
  const session = await requireAuth();
  await connectToDatabase();

  const user = await User.findById(session.userId).lean();
  let groupName: string | undefined;

  if (user?.groupId) {
    const group = await Group.findById(user.groupId).lean();
    if (group) {
      groupName = group.name;
    }
  }

  return (
    <ProfileView
      user={{
        userId: session.userId,
        fullName: user?.fullName || session.fullName,
        login: user?.login || session.login,
        role: session.role,
        groupName,
        totalCoins: user?.totalCoins || 0,
        spendableBalance: user?.spendableBalance || 0,
      }}
    />
  );
}
