import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
    },
    fullName: {
      type: String,
      required: true,
    },
      mobileNumber: {
        type: String,
        default: undefined,
      },
    password: {
      type: String,
      required: false,
      default: "",
    },
    profilePic: {
      type: String,
      default: "",
    },
  },
  { timestamps: true } // createdAt & updatedAt
);

// Ensure uniqueness only when `mobileNumber` exists (allows multiple docs without it)
userSchema.index({ mobileNumber: 1 }, { unique: true, partialFilterExpression: { mobileNumber: { $exists: true } } });

const User = mongoose.model("User", userSchema);

export default User;