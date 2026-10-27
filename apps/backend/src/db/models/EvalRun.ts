import { Schema, model, type Model, type Types } from 'mongoose';

export type EvalRunStatus = 'running' | 'completed' | 'failed';

export interface IToolCallData {
  name: string;
  input: Record<string, unknown>;
}

export interface IEvalResult {
  caseId: Types.ObjectId;
  passed: boolean;
  actualToolCalls?: IToolCallData[];
  response?: string;
  judgeScore?: number;
  judgeReasoning?: string;
  latencyMs?: number;
  tokens?: number;
}

export interface IEvalRunSummary {
  passed?: number;
  toolAccuracy?: number;
  groundedness?: number;
  refusalAccuracy?: number;
  recallAtK?: number;
  latency?: number;
  tokens?: number;
}

export interface IEvalRunObject {
  _id: Types.ObjectId;
  promptVersionId: Types.ObjectId;
  model: string;
  status: EvalRunStatus;
  triggeredBy: Types.ObjectId | 'ci';
  startedAt: Date;
  completedAt?: Date;
  summary?: IEvalRunSummary;
  results: IEvalResult[];
  createdAt: Date;
  updatedAt: Date;
  __v?: number;
}

export interface IEvalRun {
  promptVersionId: Types.ObjectId;
  model: string;
  status: EvalRunStatus;
  triggeredBy: Types.ObjectId | 'ci';
  startedAt: Date;
  completedAt?: Date;
  summary?: IEvalRunSummary;
  results: IEvalResult[];
  createdAt: Date;
  updatedAt: Date;
}

const evalRunSchema = new Schema<IEvalRun>(
  {
    promptVersionId: {
      type: Schema.Types.ObjectId,
      ref: 'PromptVersion',
      required: true,
    },
    model: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ['running', 'completed', 'failed'],
      required: true,
      default: 'running',
    },
    triggeredBy: {
      type: Schema.Types.Mixed,
      required: true,
      validate: {
        validator: (v: unknown): boolean =>
          v === 'ci' || (v instanceof Schema.Types.ObjectId) || (typeof v === 'string' && /^[0-9a-fA-F]{24}$/.test(v)),
        message: 'triggeredBy must be a valid User ObjectId or "ci".',
      },
    },
    startedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    completedAt: {
      type: Date,
    },
    summary: {
      passed: { type: Number },
      toolAccuracy: { type: Number },
      groundedness: { type: Number },
      refusalAccuracy: { type: Number },
      recallAtK: { type: Number },
      latency: { type: Number },
      tokens: { type: Number },
    },
    results: [
      {
        _id: false,
        caseId: {
          type: Schema.Types.ObjectId,
          ref: 'EvalCase',
          required: true,
        },
        passed: {
          type: Boolean,
          required: true,
        },
        actualToolCalls: [
          {
            _id: false,
            name: { type: String, required: true },
            input: { type: Schema.Types.Mixed },
          },
        ],
        response: { type: String },
        judgeScore: { type: Number },
        judgeReasoning: { type: String },
        latencyMs: { type: Number },
        tokens: { type: Number },
      },
    ],
  },
  {
    timestamps: true,
  }
);

export const EvalRun: Model<IEvalRun> = model<IEvalRun>('EvalRun', evalRunSchema);
export default EvalRun;