import { Schema, model, type Document, type Model, type Types } from 'mongoose';

export type UserRole = 'admin';

export interface IUserObject {
  _id: Types.ObjectId;
  email: string;
  name: string;
  role: UserRole;
  isActive: boolean;
  lastLoginAt?: Date;
  failedLoginAttempts?: number;
  lockedUntil?: Date;
  createdAt: Date;
  updatedAt: Date;
  __v?: number;
}

export interface IUser extends Document {
  email: string;
  passwordHash: string;
  name: string;
  role: UserRole;
  isActive: boolean;
  lastLoginAt?: Date;
  failedLoginAttempts?: number;
  lockedUntil?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
      select: false, // Excluded from queries by default
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    role: {
      type: String,
      enum: ['admin'],
      required: true,
      default: 'admin',
    },
    isActive: {
      type: Boolean,
      required: true,
      default: true,
    },
    lastLoginAt: {
      type: Date,
    },
    failedLoginAttempts: {
      type: Number,
      default: 0,
    },
    lockedUntil: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

export const User: Model<IUser> = model<IUser>('User', userSchema);
export default User;