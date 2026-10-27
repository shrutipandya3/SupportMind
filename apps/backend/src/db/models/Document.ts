import { Schema, model, type Document as MongoDocument, type Model, type Types } from 'mongoose';

export type DocumentType = 'policy' | 'manual';
export type PolicyTopic = 'returns' | 'payment' | 'delivery' | 'warranty' | 'other';
export type DocumentStatus = 'uploaded' | 'processing' | 'ready' | 'failed';

export interface IDocumentObject {
  _id: Types.ObjectId;
  title: string;
  type: DocumentType;
  policyTopic?: PolicyTopic;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  gridFsFileId: Types.ObjectId;
  checksum: string;
  pageCount?: number;
  chunkCount?: number;
  status: DocumentStatus;
  errorMessage?: string;
  version: number;
  embeddingModel?: string;
  productId?: Types.ObjectId;
  categoryId?: Types.ObjectId;
  uploadedBy: Types.ObjectId;
  processedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  __v?: number;
}

export interface IDocument extends MongoDocument {
  title: string;
  type: DocumentType;
  policyTopic?: PolicyTopic;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  gridFsFileId: Types.ObjectId;
  checksum: string;
  pageCount?: number;
  chunkCount?: number;
  status: DocumentStatus;
  errorMessage?: string;
  version: number;
  embeddingModel?: string;
  productId?: Types.ObjectId;
  categoryId?: Types.ObjectId;
  uploadedBy: Types.ObjectId;
  processedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const documentSchema = new Schema<IDocument>(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ['policy', 'manual'],
      required: true,
    },
    policyTopic: {
      type: String,
      enum: ['returns', 'payment', 'delivery', 'warranty', 'other'],
    },
    fileName: {
      type: String,
      required: true,
    },
    mimeType: {
      type: String,
      required: true,
    },
    sizeBytes: {
      type: Number,
      required: true,
    },
    gridFsFileId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    checksum: {
      type: String,
      required: true,
    },
    pageCount: {
      type: Number,
    },
    chunkCount: {
      type: Number,
    },
    status: {
      type: String,
      enum: ['uploaded', 'processing', 'ready', 'failed'],
      required: true,
      default: 'uploaded',
    },
    errorMessage: {
      type: String,
    },
    version: {
      type: Number,
      required: true,
      default: 1,
    },
    embeddingModel: {
      type: String,
      default: 'gemini-embedding-001',
    },
    productId: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
    },
    categoryId: {
      type: Schema.Types.ObjectId,
      ref: 'Category',
    },
    uploadedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    processedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

export const DocumentModel: Model<IDocument> = model<IDocument>('Document', documentSchema);
export default DocumentModel;