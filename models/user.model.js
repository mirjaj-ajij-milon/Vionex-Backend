import mongoose, { Schema } from "mongoose";

const SessionSchema = new Schema(
  {
    tokenHash: {
      type: String,
      required: true,
      index: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  { _id: false }
);

const UserSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    password: {
      type: String,
      required: true,
    },
    // Multi-device sessions with SHA-256 token digests and expiry
    sessions: [SessionSchema],
    // Legacy token field preserved for seamless zero-downtime backward compatibility
    token: {
      type: String,
      index: true,
    },
  },
  { timestamps: true }
);

// Compound index on sessions.tokenHash and sessions.expiresAt for fast validation
UserSchema.index({ "sessions.tokenHash": 1, "sessions.expiresAt": 1 });

const User = mongoose.model("user", UserSchema);

export { User };
