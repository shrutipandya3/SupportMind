import { Schema, model, type Document, type Model, type Types } from 'mongoose';

/** Plain object shape returned by chat.toObject() — safe to use as a response type */
export interface IChatObject {
  _id: Types.ObjectId;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  __v?: number;
}

export interface IChat extends Document {
  title: string;
  createdAt: Date;
  updatedAt: Date;
}

const chatSchema = new Schema<IChat>(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// Index on updatedAt for faster querying and sorting by recent updates
chatSchema.index({ updatedAt: -1 });

export const Chat: Model<IChat> = model<IChat>('Chat', chatSchema);
export default Chat;
