import mongoose, { Schema, Model, models } from "mongoose";

const MessageLogSchema = new Schema(
  {
    reminderId: { type: Schema.Types.ObjectId, ref: "Reminder" },
    phone: { type: String, required: true },
    direction: { type: String, enum: ["outbound", "inbound"], required: true },
    messageType: {
      type: String,
      enum: ["reminder", "followup", "reply"],
      required: true,
    }, // 'type' is reserved in mongoose sometimes, so using messageType
    content: { type: String, required: true },
    status: { type: String, default: "sent" }, // sent, delivered, failed, received
    rawResponse: { type: Object }, // Store raw API response or webhook payload
  },
  { timestamps: true }
);

const MessageLog =
  models.MessageLog || mongoose.model("MessageLog", MessageLogSchema);

export default MessageLog;
