"use server";

import { revalidatePath } from "next/cache";
import { connectToDatabase } from "@/lib/db/connect";
import { User, IUser } from "@/lib/db/models/user.model";
import { Group } from "@/lib/db/models/group.model";
import { AuditLog } from "@/lib/db/models/audit-log.model";
import { requireMentor } from "@/lib/auth/guards";
import { hashPassword, generateRandomPassword } from "@/lib/auth/password";
import { slugifyLogin } from "@/lib/utils";

export interface ImportedStudentResult {
  fullName: string;
  login: string;
  password: string; // Plaintext, returned only once for mentor CSV export
}

/**
 * Get students for a group (mentor only: returns full names and logins)
 */
export async function getStudentsByGroup(groupId: string) {
  await requireMentor();
  await connectToDatabase();

  const students = await User.find({ groupId, role: "student" })
    .select("-passwordHash")
    .sort({ fullName: 1 })
    .lean();

  return JSON.parse(JSON.stringify(students)) as IUser[];
}

/**
 * Bulk import students from pasted table (TSV / CSV)
 */
export async function importStudentsAction({
  groupId,
  rawText,
}: {
  groupId: string;
  rawText: string;
}): Promise<{
  success: boolean;
  message?: string;
  createdCount?: number;
  credentials?: ImportedStudentResult[];
}> {
  const mentor = await requireMentor();
  await connectToDatabase();

  const group = await Group.findById(groupId);
  if (!group) {
    return { success: false, message: "Guruh topilmadi" };
  }

  // Parse lines: Google Sheets pastes as tab-separated or comma-separated rows
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    return { success: false, message: "Kiritilgan ro'yxat bo'sh" };
  }

  const credentials: ImportedStudentResult[] = [];
  const usersToInsert: Array<{
    fullName: string;
    login: string;
    passwordHash: string;
    role: "student";
    groupId: string;
    mustChangePassword: boolean;
  }> = [];

  for (const line of lines) {
    // Split by comma or tab
    const parts = line.split(/[,\t]+/).map((p) => p.trim()).filter(Boolean);
    if (parts.length === 0) continue;

    // First column is usually name, or first + second is firstName + lastName
    const fullName = parts.slice(0, 2).join(" ");
    if (!fullName || fullName.length < 2) continue;

    // Generate unique login
    const baseLogin = slugifyLogin(fullName) || `student_${Date.now()}`;
    let candidateLogin = baseLogin;
    let counter = 1;
    // Check collision in existing DB or already planned in this batch
    while (
      usersToInsert.some((u) => u.login === candidateLogin) ||
      (await User.exists({ login: candidateLogin }))
    ) {
      counter++;
      candidateLogin = `${baseLogin}_${counter}`;
    }

    const plainPassword = generateRandomPassword(8);
    const passwordHash = await hashPassword(plainPassword);

    credentials.push({
      fullName,
      login: candidateLogin,
      password: plainPassword,
    });

    usersToInsert.push({
      fullName,
      login: candidateLogin,
      passwordHash,
      role: "student",
      groupId,
      mustChangePassword: true,
    });
  }

  if (usersToInsert.length === 0) {
    return { success: false, message: "Birorta ham to'g'ri ism-familiya topilmadi" };
  }

  await User.insertMany(usersToInsert);

  // Update group studentCount
  const count = await User.countDocuments({ groupId, role: "student" });
  group.studentCount = count;
  await group.save();

  // Audit log
  await AuditLog.create({
    actorId: mentor.userId,
    action: "IMPORT_STUDENTS",
    details: {
      groupId,
      groupName: group.name,
      count: usersToInsert.length,
      logins: credentials.map((c) => c.login),
    },
  });

  revalidatePath("/mentor/groups");
  revalidatePath(`/mentor/groups/${groupId}`);

  return {
    success: true,
    message: `${usersToInsert.length} ta o'quvchi muvaffaqiyatli import qilindi`,
    createdCount: usersToInsert.length,
    credentials,
  };
}

/**
 * Reset student password (mentor only)
 */
export async function resetPasswordAction(userId: string): Promise<{
  success: boolean;
  message?: string;
  newPassword?: string;
  login?: string;
}> {
  const mentor = await requireMentor();
  await connectToDatabase();

  const user = await User.findById(userId);
  if (!user || user.role !== "student") {
    return { success: false, message: "O'quvchi topilmadi" };
  }

  const newPassword = generateRandomPassword(8);
  user.passwordHash = await hashPassword(newPassword);
  user.mustChangePassword = true;
  await user.save();

  await AuditLog.create({
    actorId: mentor.userId,
    action: "RESET_PASSWORD",
    targetUserId: user._id,
    details: { studentLogin: user.login },
  });

  return {
    success: true,
    message: "Parol muvaffaqiyatli yangilandi",
    newPassword,
    login: user.login,
  };
}

/**
 * Move student to another group
 */
export async function moveStudentAction({
  userId,
  newGroupId,
}: {
  userId: string;
  newGroupId: string;
}): Promise<{ success: boolean; message?: string }> {
  const mentor = await requireMentor();
  await connectToDatabase();

  const user = await User.findById(userId);
  if (!user || user.role !== "student") {
    return { success: false, message: "O'quvchi topilmadi" };
  }

  const newGroup = await Group.findById(newGroupId);
  if (!newGroup) {
    return { success: false, message: "Guruh topilmadi" };
  }

  const oldGroupId = user.groupId;
  user.groupId = newGroupId as unknown as typeof user.groupId;
  await user.save();

  // Update counts for both old and new groups
  if (oldGroupId) {
    const oldCount = await User.countDocuments({ groupId: oldGroupId, role: "student" });
    await Group.findByIdAndUpdate(oldGroupId, { studentCount: oldCount });
  }
  const newCount = await User.countDocuments({ groupId: newGroupId, role: "student" });
  await Group.findByIdAndUpdate(newGroupId, { studentCount: newCount });

  await AuditLog.create({
    actorId: mentor.userId,
    action: "MOVE_STUDENT",
    targetUserId: user._id,
    details: { oldGroupId, newGroupId },
  });

  revalidatePath("/mentor/groups");
  if (oldGroupId) revalidatePath(`/mentor/groups/${oldGroupId}`);
  revalidatePath(`/mentor/groups/${newGroupId}`);

  return { success: true, message: "O'quvchi boshqa guruhga ko'chirildi" };
}

/**
 * Delete student
 */
export async function deleteStudentAction(userId: string): Promise<{ success: boolean; message?: string }> {
  const mentor = await requireMentor();
  await connectToDatabase();

  const user = await User.findById(userId);
  if (!user || user.role !== "student") {
    return { success: false, message: "O'quvchi topilmadi" };
  }

  const groupId = user.groupId;
  await User.findByIdAndDelete(userId);

  if (groupId) {
    const count = await User.countDocuments({ groupId, role: "student" });
    await Group.findByIdAndUpdate(groupId, { studentCount: count });
  }

  await AuditLog.create({
    actorId: mentor.userId,
    action: "DELETE_STUDENT",
    targetUserId: user._id,
    details: { studentLogin: user.login, fullName: user.fullName },
  });

  revalidatePath("/mentor/groups");
  if (groupId) revalidatePath(`/mentor/groups/${groupId}`);

  return { success: true, message: "O'quvchi o'chirildi" };
}
