import { Schema, model, type Document, type Model, type Types } from 'mongoose';

export type EvalCategory =
  | 'faq'
  | 'product_lookup'
  | 'comparison'
  | 'multi_tool'
  | 'out_of_scope'
  | 'injection'
  | 'ticket_handoff';

export type ExpectedBehavior = 'answer' | 'refuse' | 'escalate';

export interface IEvalMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface IExpectedOutcome {
  behavior: ExpectedBehavior;
  tools?: string[];
  facts?: string[];
  forbidden?: string[];
  documentIds?: Types.ObjectId[];
}

export interface IEvalCaseObject {
  _id: Types.ObjectId;
  name: string;
  category: EvalCategory;
  messages: IEvalMessage[];
  expected: IExpectedOutcome;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  __v?: number;
}

export interface IEvalCase extends Document {
  name: string;
  category: EvalCategory;
  messages: IEvalMessage[];
  expected: IExpectedOutcome;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const evalCaseSchema = new Schema<IEvalCase>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      enum: ['faq', 'product_lookup', 'comparison', 'multi_tool', 'out_of_scope', 'injection', 'ticket_handoff'],
      required: true,
    },
    messages: [
      {
        _id: false,
        role: { type: String, enum: ['user', 'assistant'], required: true },
        content: { type: String, required: true },
      },
    ],
    expected: {
      behavior: {
        type: String,
        enum: ['answer', 'refuse', 'escalate'],
        required: true,
      },
      tools: [{ type: String }],
      facts: [{ type: String }],
      forbidden: [{ type: String }],
      documentIds: [{ type: Schema.Types.ObjectId, ref: 'Document' }],
    },
    active: {
      type: Boolean,
      required: true,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

export const EvalCase: Model<IEvalCase> = model<IEvalCase>('EvalCase', evalCaseSchema);
export default EvalCase;