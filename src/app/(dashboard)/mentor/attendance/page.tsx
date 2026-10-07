import { redirect } from "next/navigation";

// Davomat endi guruhlar ichida: eski havola va xatcho'plar Guruhlar sahifasiga olib boradi
export default function MentorAttendancePage() {
  redirect("/mentor/groups");
}
