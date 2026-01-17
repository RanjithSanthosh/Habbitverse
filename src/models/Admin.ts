import mongoose, { Schema, Model, models } from "mongoose";

const AdminSchema = new Schema(
  {
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true }, // Hashed
  },
  { timestamps: true }
);

const Admin = models.Admin || mongoose.model("Admin", AdminSchema);

export default Admin;
