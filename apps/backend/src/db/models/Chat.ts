import { Schema, model, type Document, type Model, type Types } from 'mongoose';

export type ChatStatus = 'active' | 'archived';

export interface IChatObject {
  _id: Types.ObjectId;
  title: string;
  sessionId: string;
  userId?: Types.ObjectId;
  status: ChatStatus;
  ticketId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  __v?: number;
}

export interface IChat extends Document {
  title: string;
  sessionId: string;
  userId?: Types.ObjectId;
  status: ChatStatus;
  ticketId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const chatSchema = new Schema<IChat>(
  {
    title: {
      type: String,
      required: true,
      default: 'New chat',
      trim: true,
    },
    sessionId: {
      type: String,
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    status: {
      type: String,
      enum: ['active', 'archived'],
      required: true,
      default: 'active',
    },
    ticketId: {
      type: Schema.Types.ObjectId,
      ref: 'Ticket',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Ownership and recent activity index
chatSchema.index({ sessionId: 1, updatedAt: -1 });

export const Chat: Model<IChat> = model<IChat>('Chat', chatSchema);
export default Chat;