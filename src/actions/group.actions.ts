"use server";

import { revalidatePath } from "next/cache";
import { connectToDatabase } from "@/lib/db/connect";
import { Group, IGroup } from "@/lib/db/models/group.model";
import { User } from "@/lib/db/models/user.model";
import { AuditLog } from "@/lib/db/models/audit-log.model";
import { requireMentor, requireAuth, requireGroupAccess } from "@/lib/auth/guards";
import { groupSchema, GroupInput } from "@/lib/validations/group.schema";

export async function getGroups() {
  await connectToDatabase();
  const session = await requireAuth();

  if (session.role === "mentor") {
    const groups = await Group.find({ isActive: true }).sort({ grade: 1, name: 1 }).lean();
    return JSON.parse(JSON.stringify(groups)) as IGroup[];
  } else {
    if (!session.groupId) return [];
    const group = await Group.findById(session.groupId).lean();
    return group ? ([JSON.parse(JSON.stringify(group))] as IGroup[]) : [];
  }
}

export async function getGroupById(id: string) {
  await connectToDatabase();
  await requireGroupAccess(id);

  const group = await Group.findById(id).lean();
  if (!group) return null;
  return JSON.parse(JSON.stringify(group)) as IGroup;
}

export async function createGroupAction(input: GroupInput) {
  const mentor = await requireMentor();
  const parsed = groupSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, message: "Ma'lumotlar noto'g'ri", errors: parsed.error.flatten().fieldErrors };
  }

  await connectToDatabase();

  const existing = await Group.findOne({ name: parsed.data.name });
  if (existing) {
    return { success: false, message: "Bunday nomli guruh allaqachon mavjud" };
  }

  const group = await Group.create(parsed.data);

  await AuditLog.create({
    actorId: mentor.userId,
    action: "CREATE_GROUP",
    details: { groupId: group._id, groupName: group.name, grade: group.grade },
  });

  revalidatePath("/mentor/groups");
  return { success: true, message: "Guruh muvaffaqiyatli yaratildi", data: JSON.parse(JSON.stringify(group)) };
}

export async function updateGroupAction(id: string, input: Partial<GroupInput>) {
  const mentor = await requireMentor();
  await connectToDatabase();

  const group = await Group.findById(id);
  if (!group) {
    return { success: false, message: "Guruh topilmadi" };
  }

  if (input.name && input.name !== group.name) {
    const existing = await Group.findOne({ name: input.name, _id: { $ne: id } });
    if (existing) {
      return { success: false, message: "Bu nom boshqa guruh tomonidan band qilingan" };
    }
    group.name = input.name;
  }

  if (input.grade) group.grade = input.grade;
  if (input.academicYear) group.academicYear = input.academicYear;
  if (input.isActive !== undefined) group.isActive = input.isActive;

  await group.save();

  await AuditLog.create({
    actorId: mentor.userId,
    action: "UPDATE_GROUP",
    details: { groupId: group._id, changes: input },
  });

  revalidatePath("/mentor/groups");
  revalidatePath(`/mentor/groups/${id}`);
  return { success: true, message: "Guruh yangilandi", data: JSON.parse(JSON.stringify(group)) };
}

export async function deleteGroupAction(id: string) {
  const mentor = await requireMentor();
  await connectToDatabase();

  const studentCount = await User.countDocuments({ groupId: id });
  if (studentCount > 0) {
    return {
      success: false,
      message: `Guruhda ${studentCount} ta o'quvchi bor. Avval ularni boshqa guruhga ko'chiring yoki o'chiring`,
    };
  }

  const group = await Group.findByIdAndDelete(id);

  await AuditLog.create({
    actorId: mentor.userId,
    action: "DELETE_GROUP",
    details: { groupId: id, groupName: group?.name },
  });

  revalidatePath("/mentor/groups");
  return { success: true, message: "Guruh o'chirildi" };
}
