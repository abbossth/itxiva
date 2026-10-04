import mongoose, { Schema, Document, Model } from "mongoose";

export type UserRole = "mentor" | "student";

export interface IUserData {
  _id: string | mongoose.Types.ObjectId;
  fullName: string;
  login: string;
  role: UserRole;
  groupId?: string | mongoose.Types.ObjectId | null;
  mustChangePassword?: boolean;
  totalCoins?: number;
  spendableBalance?: number;
  isHiddenFromLeaderboard?: boolean;
  lastLoginAt?: Date | string | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

export interface IUser extends Document, Omit<IUserData, "_id"> {
  _id: mongoose.Types.ObjectId;
  passwordHash: string;
}

const UserSchema = new Schema<IUser>(
  {
    fullName: {
      type: String,
      required: true,
      trim: true,
    },
    login: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ["mentor", "student"],
      default: "student",
      required: true,
    },
    groupId: {
      type: Schema.Types.ObjectId,
      ref: "Group",
      default: null,
      index: true,
    },
    mustChangePassword: {
      type: Boolean,
      default: true,
    },
    totalCoins: {
      type: Number,
      default: 0,
      index: true,
    },
    spendableBalance: {
      type: Number,
      default: 0,
    },
    isHiddenFromLeaderboard: {
      type: Boolean,
      default: false,
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

UserSchema.index({ role: 1, isHiddenFromLeaderboard: 1, totalCoins: -1 });
UserSchema.index({ groupId: 1, role: 1, isHiddenFromLeaderboard: 1, totalCoins: -1 });

export const User: Model<IUser> =
  mongoose.models.User || mongoose.model<IUser>("User", UserSchema);
