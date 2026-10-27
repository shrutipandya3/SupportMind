import { Schema, model, type Document, type Model, type Types } from 'mongoose';

export interface IProductObject {
  _id: Types.ObjectId;
  sku: string;
  name: string;
  brand: string;
  categoryId: Types.ObjectId;
  shortDescription: string;
  longDescription?: string;
  features?: string[];
  specs: Record<string, unknown>;
  price: number;
  stockCount: number;
  active: boolean;
  warrantyMonths?: number;
  tags?: string[];
  searchText: string;
  createdAt: Date;
  updatedAt: Date;
  __v?: number;
}

export interface IProduct extends Document {
  sku: string;
  name: string;
  brand: string;
  categoryId: Types.ObjectId;
  shortDescription: string;
  longDescription?: string;
  features?: string[];
  specs: Record<string, unknown>;
  price: number;
  stockCount: number;
  active: boolean;
  warrantyMonths?: number;
  tags?: string[];
  searchText: string;
  createdAt: Date;
  updatedAt: Date;
}

const productSchema = new Schema<IProduct>(
  {
    sku: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    brand: {
      type: String,
      required: true,
      trim: true,
    },
    categoryId: {
      type: Schema.Types.ObjectId,
      ref: 'Category',
      required: true,
    },
    shortDescription: {
      type: String,
      required: true,
      trim: true,
    },
    longDescription: {
      type: String,
    },
    features: [{ type: String }],
    specs: {
      type: Schema.Types.Mixed,
      required: true,
      default: {},
    },
    price: {
      type: Number,
      required: true, // In paise (INR)
    },
    stockCount: {
      type: Number,
      required: true,
      default: 0,
    },
    active: {
      type: Boolean,
      required: true,
      default: true,
    },
    warrantyMonths: {
      type: Number,
    },
    tags: [{ type: String }],
    searchText: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
productSchema.index({ categoryId: 1, brand: 1 });
productSchema.index({ price: 1 });
productSchema.index({ active: 1 });
productSchema.index({ searchText: 'text' });

export const Product: Model<IProduct> = model<IProduct>('Product', productSchema);
export default Product;