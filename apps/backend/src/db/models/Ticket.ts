import { Schema, model, type Document, type Model, type Types } from 'mongoose';

export type TicketStatus = 'open' | 'in_progress' | 'waiting_on_customer' | 'resolved' | 'closed';
export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TicketSource = 'chatbot' | 'admin';
export type EscalationReason =
  | 'user_requested'
  | 'low_confidence'
  | 'tool_failure'
  | 'repeated_failure'
  | 'out_of_scope';

export interface ITicketCustomer {
  email: string;
  name?: string;
  phone?: string;
}

export interface IInternalNote {
  authorId: Types.ObjectId;
  text: string;
  createdAt: Date;
}

export interface ITicketObject {
  _id: Types.ObjectId;
  ticketNumber: string;
  subject: string;
  customer: ITicketCustomer;
  status: TicketStatus;
  priority: TicketPriority;
  source: TicketSource;
  escalationReason?: EscalationReason;
  relatedOrderIds?: string[];
  relatedProductIds?: Types.ObjectId[];
  chatId: Types.ObjectId;
  conversationSummary: string;
  assigneeId?: Types.ObjectId;
  internalNotes?: IInternalNote[];
  resolvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  __v?: number;
}

export interface ITicket extends Document {
  ticketNumber: string;
  subject: string;
  customer: ITicketCustomer;
  status: TicketStatus;
  priority: TicketPriority;
  source: TicketSource;
  escalationReason?: EscalationReason;
  relatedOrderIds?: string[];
  relatedProductIds?: Types.ObjectId[];
  chatId: Types.ObjectId;
  conversationSummary: string;
  assigneeId?: Types.ObjectId;
  internalNotes?: IInternalNote[];
  resolvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ticketSchema = new Schema<ITicket>(
  {
    ticketNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    subject: {
      type: String,
      required: true,
      trim: true,
    },
    customer: {
      email: { type: String, required: true, lowercase: true, trim: true },
      name: { type: String, trim: true },
      phone: { type: String, trim: true },
    },
    status: {
      type: String,
      enum: ['open', 'in_progress', 'waiting_on_customer', 'resolved', 'closed'],
      required: true,
      default: 'open',
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'urgent'],
      required: true,
      default: 'medium',
    },
    source: {
      type: String,
      enum: ['chatbot', 'admin'],
      required: true,
      default: 'chatbot',
    },
    escalationReason: {
      type: String,
      enum: ['user_requested', 'low_confidence', 'tool_failure', 'repeated_failure', 'out_of_scope'],
    },
    relatedOrderIds: [{ type: String }],
    relatedProductIds: [{ type: Schema.Types.ObjectId, ref: 'Product' }],
    chatId: {
      type: Schema.Types.ObjectId,
      ref: 'Chat',
      required: true,
    },
    conversationSummary: {
      type: String,
      required: true,
    },
    assigneeId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    internalNotes: [
      {
        _id: false,
        authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        text: { type: String, required: true },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    resolvedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Admin dashboard triage index
ticketSchema.index({ status: 1, priority: 1, createdAt: -1 });

export const Ticket: Model<ITicket> = model<ITicket>('Ticket', ticketSchema);
export default Ticket;