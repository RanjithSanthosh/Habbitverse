import mongoose, { Schema, Model, models } from "mongoose";

export interface IReminderExecution {
  _id?: mongoose.Types.ObjectId;
  reminderId: mongoose.Types.ObjectId; // Reference to the parent config
  phone: string;
  date: string; // YYYY-MM-DD (IST) representing the "day" of this execution

  status: "sent" | "replied" | "failed" | "completed";
  sentAt: Date;
  replyReceivedAt?: Date;

  followUpStatus:
    | "pending"
    | "sent"
    | "skipped"
    | "replied_before_followup"
    | "cancelled_by_user";
  followUpSentAt?: Date;

  createdAt?: Date;
  updatedAt?: Date;
}

const ReminderExecutionSchema = new Schema<IReminderExecution>(
  {
    reminderId: {
      type: Schema.Types.ObjectId,
      ref: "Reminder",
      required: true,
    },
    phone: { type: String, required: true },
    date: { type: String, required: true }, // Index this for fast lookup

    status: {
      type: String,
      enum: ["sent", "replied", "failed", "completed"],
      default: "sent",
    },
    sentAt: { type: Date, default: Date.now },
    replyReceivedAt: { type: Date },

    followUpStatus: {
      type: String,
      enum: [
        "pending",
        "sent",
        "skipped",
        "replied_before_followup",
        "cancelled_by_user",
      ],
      default: "pending",
    },
    followUpSentAt: { type: Date },
  },
  { timestamps: true }
);

// Compound index to ensure we can quickly find today's execution for a specific reminder
ReminderExecutionSchema.index({ reminderId: 1, date: 1 });
ReminderExecutionSchema.index({ phone: 1, date: 1 });

const ReminderExecution: Model<IReminderExecution> =
  models.ReminderExecution ||
  mongoose.model<IReminderExecution>(
    "ReminderExecution",
    ReminderExecutionSchema
  );

export default ReminderExecution;
