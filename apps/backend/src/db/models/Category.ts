import { Schema, model, type Document, type Model, type Types } from 'mongoose';

export type AttributeType = 'string' | 'number' | 'boolean' | 'enum';

export interface ICategoryAttribute {
  key: string;
  label: string;
  type: AttributeType;
  unit?: string;
  enumValues?: string[];
  min?: number;
  max?: number;
  required?: boolean;
  filterable?: boolean;
  comparable?: boolean;
  displayOrder?: number;
}

export interface ICategoryObject {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  description?: string;
  attributes: ICategoryAttribute[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  __v?: number;
}

export interface ICategory extends Document {
  name: string;
  slug: string;
  description?: string;
  attributes: ICategoryAttribute[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const categorySchema = new Schema<ICategory>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    description: {
      type: String,
    },
    attributes: [
      {
        _id: false,
        key: { type: String, required: true },
        label: { type: String, required: true },
        type: {
          type: String,
          enum: ['string', 'number', 'boolean', 'enum'],
          required: true,
        },
        unit: { type: String },
        enumValues: [{ type: String }],
        min: { type: Number },
        max: { type: Number },
        required: { type: Boolean, default: false },
        filterable: { type: Boolean, default: false },
        comparable: { type: Boolean, default: false },
        displayOrder: { type: Number, default: 0 },
      },
    ],
    isActive: {
      type: Boolean,
      required: true,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

export const Category: Model<ICategory> = model<ICategory>('Category', categorySchema);
export default Category;