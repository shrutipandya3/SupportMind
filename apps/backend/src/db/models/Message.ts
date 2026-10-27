import { Schema, model, type Model, type Types } from 'mongoose';

export type MessageRole = 'user' | 'assistant';
export type MessageStatus = 'streaming' | 'complete' | 'stopped' | 'error';
export type ReplyType = 'llm' | 'canned' | 'cached';
export type GuardrailFlag = 'none' | 'input_blocked' | 'output_blocked';
export type FeedbackRating = 'up' | 'down';

export interface ISource {
  documentId: Types.ObjectId;
  documentName: string;
  page?: number;
  chunkId?: Types.ObjectId;
}

export interface IToolCall {
  name: string;
  input: Record<string, unknown>;
  resultSummary?: string;
  isError: boolean;
  latencyMs?: number;
}

export interface IMessageFeedback {
  rating?: FeedbackRating;
  comment?: string;
  updatedAt?: Date;
}

/** Plain object shape */
export interface IMessageObject {
  _id: Types.ObjectId;
  chatId: Types.ObjectId;
  role: MessageRole;
  content: string;
  status: MessageStatus;
  replyType?: ReplyType;
  sources?: ISource[];
  toolCalls?: IToolCall[];
  promptVersionId?: Types.ObjectId;
  model?: string;
  guardrailFlag?: GuardrailFlag;
  errorMessage?: string;
  feedback?: IMessageFeedback;
  createdAt: Date;
  updatedAt: Date;
  __v?: number;
}

/** Pure data interface — does not extend Document to prevent method name collision */
export interface IMessage {
  chatId: Types.ObjectId;
  role: MessageRole;
  content: string;
  status: MessageStatus;
  replyType?: ReplyType;
  sources?: ISource[];
  toolCalls?: IToolCall[];
  promptVersionId?: Types.ObjectId;
  model?: string;
  guardrailFlag?: GuardrailFlag;
  errorMessage?: string;
  feedback?: IMessageFeedback;
  createdAt: Date;
  updatedAt: Date;
}

const messageSchema = new Schema<IMessage>(
  {
    chatId: {
      type: Schema.Types.ObjectId,
      ref: 'Chat',
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: ['user', 'assistant'],
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['streaming', 'complete', 'stopped', 'error'],
      required: true,
      default: 'complete',
    },
    replyType: {
      type: String,
      enum: ['llm', 'canned', 'cached'],
    },
    sources: [
      {
        _id: false,
        documentId: { type: Schema.Types.ObjectId, ref: 'Document', required: true },
        documentName: { type: String, required: true },
        page: { type: Number },
        chunkId: { type: Schema.Types.ObjectId, ref: 'Chunk' },
      },
    ],
    toolCalls: [
      {
        _id: false,
        name: { type: String, required: true },
        input: { type: Schema.Types.Mixed },
        resultSummary: { type: String },
        isError: { type: Boolean, default: false },
        latencyMs: { type: Number },
      },
    ],
    promptVersionId: {
      type: Schema.Types.ObjectId,
      ref: 'PromptVersion',
    },
    model: {
      type: String,
    },
    guardrailFlag: {
      type: String,
      enum: ['none', 'input_blocked', 'output_blocked'],
      default: 'none',
    },
    errorMessage: {
      type: String,
    },
    feedback: {
      rating: {
        type: String,
        enum: ['up', 'down'],
      },
      comment: {
        type: String,
        maxlength: 500,
        trim: true,
      },
      updatedAt: {
        type: Date,
      },
    },
  },
  {
    timestamps: true,
  }
);

messageSchema.index({ chatId: 1, createdAt: 1 });

export const Message: Model<IMessage> = model<IMessage>('Message', messageSchema);
export default Message;