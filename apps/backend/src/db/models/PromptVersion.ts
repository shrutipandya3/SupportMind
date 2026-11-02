// apps/backend/src/db/models/PromptVersion.ts
import { Schema, model, type InferSchemaType } from "mongoose";

const promptVersionSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    version: { type: Number, required: true, min: 1 },
    text: { type: String, required: true },
    contentHash: { type: String, required: true }, // sha256 hex
    isActive: { type: Boolean, required: true, default: false },
    createdAt: { type: Date, required: true, default: Date.now },
  },
  { versionKey: false }
);

promptVersionSchema.index({ name: 1, version: 1 }, { unique: true });

export type PromptVersionDoc = InferSchemaType<typeof promptVersionSchema>;
export const PromptVersion = model("PromptVersion", promptVersionSchema);