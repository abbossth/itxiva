import { requireAuth } from "@/lib/auth/guards";
import { connectToDatabase } from "@/lib/db/connect";
import { User } from "@/lib/db/models/user.model";
import { Group } from "@/lib/db/models/group.model";
import { ProfileView } from "@/components/profile/profile-view";
import { getTelegramStatus } from "@/actions/telegram.actions";

export const metadata = {
  title: "Mening profilim — ITXiva",
};

export default async function ProfilePage() {
  const session = await requireAuth();
  await connectToDatabase();

  const [user, telegram] = await Promise.all([
    User.findById(session.userId).select("fullName login groupId totalCoins spendableBalance").lean(),
    getTelegramStatus(),
  ]);
  let groupName: string | undefined;

  if (user?.groupId) {
    const group = await Group.findById(user.groupId).lean();
    if (group) {
      groupName = group.name;
    }
  }

  return (
    <ProfileView
      telegram={telegram}
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
