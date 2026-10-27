import { Schema, model, type Document, type Model, type Types } from 'mongoose';

export interface IPromptSettings {
  temperature?: number;
  maxTokens?: number;
}

export interface IPromptVersionObject {
  _id: Types.ObjectId;
  name: string;
  version: number;
  content: string;
  settings?: IPromptSettings;
  changeNote?: string;
  isActive: boolean;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  __v?: number;
}

export interface IPromptVersion extends Document {
  name: string;
  version: number;
  content: string;
  settings?: IPromptSettings;
  changeNote?: string;
  isActive: boolean;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const promptVersionSchema = new Schema<IPromptVersion>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    version: {
      type: Number,
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    settings: {
      temperature: { type: Number },
      maxTokens: { type: Number },
    },
    changeNote: {
      type: String,
    },
    isActive: {
      type: Boolean,
      required: true,
      default: false,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Unique compound index on name and version
promptVersionSchema.index({ name: 1, version: 1 }, { unique: true });

export const PromptVersion: Model<IPromptVersion> = model<IPromptVersion>('PromptVersion', promptVersionSchema);
export default PromptVersion;