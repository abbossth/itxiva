import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth/guards";
import { connectToDatabase } from "@/lib/db/connect";
import { User } from "@/lib/db/models/user.model";
import { ProfileView } from "@/components/profile/profile-view";
import { MyProfileView } from "@/components/profile/my-profile-view";
import { getMyProfile } from "@/actions/student-profile.actions";
import { getTelegramStatus } from "@/actions/telegram.actions";

export const metadata = {
  title: "Mening profilim — ITXiva",
};

export default async function ProfilePage() {
  const session = await requireAuth();
  await connectToDatabase();

  const [user, telegram] = await Promise.all([
    User.findById(session.userId).select("fullName login celebrationsEnabled").lean(),
    getTelegramStatus(),
  ]);
  const fullName = user?.fullName || session.fullName;
  const login = user?.login || session.login;
  const celebrationsEnabled = user?.celebrationsEnabled !== false;

  if (session.role === "student") {
    const data = await getMyProfile();
    if (!data) notFound();
    return (
      <MyProfileView
        data={data}
        userId={session.userId}
        fullName={fullName}
        login={login}
        telegram={telegram}
        celebrationsEnabled={celebrationsEnabled}
      />
    );
  }

  return <ProfileView telegram={telegram} celebrationsEnabled={celebrationsEnabled} user={{ fullName, login }} />;
}
