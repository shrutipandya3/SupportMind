import { Schema, model, type Model, type Types } from 'mongoose';

export type UsagePurpose = 'chat' | 'judge' | 'summary' | 'embedding';
export type UsageOutcome = 'answered' | 'ticket_created' | 'input_blocked' | 'output_blocked' | 'error';

export interface IUsageLogObject {
  _id: Types.ObjectId;
  identity: string;
  chatId?: Types.ObjectId;
  messageId?: Types.ObjectId;
  promptVersionId?: Types.ObjectId;
  evalRunId?: Types.ObjectId;
  purpose: UsagePurpose;
  model: string;
  inputTokens: number;
  outputTokens: number;
  thoughtsTokens?: number;
  cachedTokens?: number;
  responseCacheHit?: boolean;
  toolCallCount?: number;
  latencyMs: number;
  estimatedCost?: number;
  outcome: UsageOutcome;
  errorCode?: string;
  createdAt: Date;
  updatedAt: Date;
  __v?: number;
}

/** Pure interface without extending Document to avoid method collisions */
export interface IUsageLog {
  identity: string;
  chatId?: Types.ObjectId;
  messageId?: Types.ObjectId;
  promptVersionId?: Types.ObjectId;
  evalRunId?: Types.ObjectId;
  purpose: UsagePurpose;
  model: string;
  inputTokens: number;
  outputTokens: number;
  thoughtsTokens?: number;
  cachedTokens?: number;
  responseCacheHit?: boolean;
  toolCallCount?: number;
  latencyMs: number;
  estimatedCost?: number;
  outcome: UsageOutcome;
  errorCode?: string;
  createdAt: Date;
  updatedAt: Date;
}

const usageLogSchema = new Schema<IUsageLog>(
  {
    identity: {
      type: String,
      required: true,
      index: true,
    },
    chatId: {
      type: Schema.Types.ObjectId,
      ref: 'Chat',
    },
    messageId: {
      type: Schema.Types.ObjectId,
      ref: 'Message',
    },
    promptVersionId: {
      type: Schema.Types.ObjectId,
      ref: 'PromptVersion',
    },
    evalRunId: {
      type: Schema.Types.ObjectId,
      ref: 'EvalRun',
    },
    purpose: {
      type: String,
      enum: ['chat', 'judge', 'summary', 'embedding'],
      required: true,
    },
    model: {
      type: String,
      required: true,
      trim: true,
    },
    inputTokens: {
      type: Number,
      required: true,
    },
    outputTokens: {
      type: Number,
      required: true,
    },
    thoughtsTokens: {
      type: Number,
    },
    cachedTokens: {
      type: Number,
    },
    responseCacheHit: {
      type: Boolean,
    },
    toolCallCount: {
      type: Number,
    },
    latencyMs: {
      type: Number,
      required: true,
    },
    estimatedCost: {
      type: Number,
    },
    outcome: {
      type: String,
      enum: ['answered', 'ticket_created', 'input_blocked', 'output_blocked', 'error'],
      required: true,
    },
    errorCode: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

// 90-day TTL index on createdAt
usageLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

// Composite index for session/user lookups over time
usageLogSchema.index({ identity: 1, createdAt: -1 });

export const UsageLog: Model<IUsageLog> = model<IUsageLog>('UsageLog', usageLogSchema);
export default UsageLog;