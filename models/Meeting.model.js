import mongoose, { Schema } from "mongoose";

const MeetingSchema = new Schema(
  {
    user_id: {
      type: String,
      required: true,
      index: true,
    },
    meetingCode: {
      type: String,
      required: true,
      trim: true,
    },
    date: {
      type: Date,
      default: Date.now,
      required: true,
    },
  },
  { timestamps: true }
);

// Compound index to optimize sorted meeting history queries
MeetingSchema.index({ user_id: 1, date: -1 });

const Meeting = mongoose.model("meeting", MeetingSchema);

export { Meeting };
