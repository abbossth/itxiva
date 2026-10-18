import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * Mentor e'loni: o'quvchi platformaga kirganda modal oynada bir marta (yopguncha) ko'rsatiladi.
 * Matn, rasmlar, havolalar va fayllar; auditoriya — hamma, guruhlar yoki sinflar; ko'rsatish muddati.
 */
export type AnnouncementAudience = "all" | "groups" | "grades";
export type AnnouncementStatus = "draft" | "published" | "archived";
export type AnnouncementTheme = "info" | "important" | "holiday" | "celebration";

export interface IAnnouncementFile {
  key: string;
  name: string;
  size: number;
  mimeType: string;
}

export interface IAnnouncementLink {
  label: string;
  url: string;
}

export interface IAnnouncement extends Document {
  _id: mongoose.Types.ObjectId;
  title: string;
  body: string;
  theme: AnnouncementTheme;
  images: IAnnouncementFile[];
  files: IAnnouncementFile[];
  links: IAnnouncementLink[];
  audience: AnnouncementAudience;
  groupIds: mongoose.Types.ObjectId[];
  grades: number[];
  startsAt: Date;
  endsAt: Date | null;
  status: AnnouncementStatus;
  publishedAt: Date | null;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const FileSchema = new Schema<IAnnouncementFile>(
  {
    key: { type: String, required: true },
    name: { type: String, required: true, maxlength: 200 },
    size: { type: Number, default: 0 },
    mimeType: { type: String, default: "application/octet-stream" },
  },
  { _id: false }
);

const AnnouncementSchema = new Schema<IAnnouncement>(
  {
    title: { type: String, required: true, trim: true, maxlength: 160 },
    body: { type: String, default: "", maxlength: 5000 },
    theme: { type: String, enum: ["info", "important", "holiday", "celebration"], default: "info" },
    images: { type: [FileSchema], default: [] },
    files: { type: [FileSchema], default: [] },
    links: {
      type: [new Schema<IAnnouncementLink>({ label: { type: String, maxlength: 80 }, url: { type: String, required: true, maxlength: 2000 } }, { _id: false })],
      default: [],
    },
    audience: { type: String, enum: ["all", "groups", "grades"], default: "all" },
    groupIds: [{ type: Schema.Types.ObjectId, ref: "Group" }],
    grades: [{ type: Number }],
    startsAt: { type: Date, default: () => new Date() },
    endsAt: { type: Date, default: null },
    status: { type: String, enum: ["draft", "published", "archived"], default: "draft", index: true },
    publishedAt: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

AnnouncementSchema.index({ status: 1, startsAt: -1 });

export const Announcement: Model<IAnnouncement> =
  mongoose.models.Announcement || mongoose.model<IAnnouncement>("Announcement", AnnouncementSchema);

/** O'quvchi e'lonni ko'rgani, yopgani va undagi havola/fayllarni bosgani (statistika uchun) */
export interface IAnnouncementView extends Document {
  announcementId: mongoose.Types.ObjectId;
  studentId: mongoose.Types.ObjectId;
  firstSeenAt: Date;
  lastSeenAt: Date;
  views: number;
  dismissedAt: Date | null;
  /** Bosilgan havola/fayllar: "link:0", "file:2", "image:1" */
  clicked: string[];
  clicks: number;
}

const AnnouncementViewSchema = new Schema<IAnnouncementView>({
  announcementId: { type: Schema.Types.ObjectId, ref: "Announcement", required: true },
  studentId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  firstSeenAt: { type: Date, default: () => new Date() },
  lastSeenAt: { type: Date, default: () => new Date() },
  views: { type: Number, default: 0 },
  dismissedAt: { type: Date, default: null },
  clicked: { type: [String], default: [] },
  clicks: { type: Number, default: 0 },
});

AnnouncementViewSchema.index({ announcementId: 1, studentId: 1 }, { unique: true });
AnnouncementViewSchema.index({ studentId: 1, dismissedAt: 1 });

export const AnnouncementView: Model<IAnnouncementView> =
  mongoose.models.AnnouncementView || mongoose.model<IAnnouncementView>("AnnouncementView", AnnouncementViewSchema);
