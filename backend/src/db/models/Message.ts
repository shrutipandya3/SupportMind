import { Schema, model, type Document, type Model, type Types } from 'mongoose';

export type MessageRole = 'user' | 'assistant' | 'system' | (string & {});

export interface IMessage extends Document {
  chatId: Types.ObjectId;
  role: MessageRole;
  content: string;
  createdAt: Date;
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
      required: true,
      trim: true,
    },
    content: {
      type: String,
      required: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  }
);

export const Message: Model<IMessage> = model<IMessage>('Message', messageSchema);
export default Message;
