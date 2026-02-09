import mongoose, { Schema, Model, models } from "mongoose";

export interface IReminder {
  _id?: mongoose.Types.ObjectId;
  phone: string;
  title: string;
  message: string;
  reminderTime: string; // HH:MM (24h)
  followUpMessage: string;
  followUpTime: string; // HH:MM
  isActive: boolean;

  // Message Config
  messageType: "text" | "template";
  templateName?: string;
  templateLanguage?: string;

  // Tracking state
  lastSentAt?: Date;
  followUpSent: boolean;
  dailyStatus:
    | "pending"
    | "sent"
    | "replied"
    | "missed"
    | "failed"
    | "completed";
  replyText?: string;
  lastRepliedAt?: Date;

  createdAt?: Date;
  updatedAt?: Date;
}

const ReminderSchema = new Schema<IReminder>(
  {
    phone: { type: String, required: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    reminderTime: { type: String, required: true }, // Format: "14:30"

    followUpMessage: { type: String },
    followUpTime: { type: String }, // Format: "15:00"

    messageType: { type: String, enum: ["text", "template"], default: "text" },
    templateName: { type: String },
    templateLanguage: { type: String, default: "en_US" },

    isActive: { type: Boolean, default: true },

    lastSentAt: { type: Date },
    followUpSent: { type: Boolean, default: false },
    dailyStatus: {
      type: String,
      enum: ["pending", "sent", "replied", "missed", "failed", "completed"],
      default: "pending",
    },
    replyText: { type: String },
    lastRepliedAt: { type: Date },
  },
  { timestamps: true },
);

// Prevent overwriting model during HMR
const Reminder: Model<IReminder> =
  models.Reminder || mongoose.model<IReminder>("Reminder", ReminderSchema);

export default Reminder;
