import { Schema, model, type Document, type Model, type Types } from 'mongoose';

export type ChunkDocType = 'policy' | 'manual';

export interface IChunkObject {
  _id: Types.ObjectId;
  documentId: Types.ObjectId;
  documentVersion: number;
  chunkIndex: number;
  text: string;
  pageStart: number;
  pageEnd: number;
  sectionTitle?: string;
  tokenCount: number;
  embedding: number[];
  docType: ChunkDocType;
  productId?: Types.ObjectId;
  categoryId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  __v?: number;
}

export interface IChunk extends Document {
  documentId: Types.ObjectId;
  documentVersion: number;
  chunkIndex: number;
  text: string;
  pageStart: number;
  pageEnd: number;
  sectionTitle?: string;
  tokenCount: number;
  embedding: number[];
  docType: ChunkDocType;
  productId?: Types.ObjectId;
  categoryId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const chunkSchema = new Schema<IChunk>(
  {
    documentId: {
      type: Schema.Types.ObjectId,
      ref: 'Document',
      required: true,
    },
    documentVersion: {
      type: Number,
      required: true,
    },
    chunkIndex: {
      type: Number,
      required: true,
    },
    text: {
      type: String,
      required: true,
    },
    pageStart: {
      type: Number,
      required: true,
    },
    pageEnd: {
      type: Number,
      required: true,
    },
    sectionTitle: {
      type: String,
    },
    tokenCount: {
      type: Number,
      required: true,
    },
    embedding: {
      type: [Number],
      required: true,
      validate: {
        validator: (v: number[]) => v.length === 768,
        message: 'Embedding length must be exactly 768 dimensions.',
      },
    },
    docType: {
      type: String,
      enum: ['policy', 'manual'],
      required: true,
    },
    productId: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
    },
    categoryId: {
      type: Schema.Types.ObjectId,
      ref: 'Category',
    },
  },
  {
    timestamps: true,
  }
);

// Version lookup index
chunkSchema.index({ documentId: 1, documentVersion: 1 });

// Full text search (Atlas BM25 / local text index)
chunkSchema.index({ text: 'text' });

export const Chunk: Model<IChunk> = model<IChunk>('Chunk', chunkSchema);
export default Chunk;