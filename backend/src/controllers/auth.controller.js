import User from "../models/User.js";
import supabaseAdmin from "../lib/supabase.js";
import { sendWelcomeEmail } from "../emails/emailHandlers.js";
import { ENV } from "../lib/env.js";
import cloudinary from "../lib/cloudinary.js";

// ─── SIGNUP ─────────────────────────────────────────────────────────────────
export const signup = async (req, res) => {
  const { fullName, email, password } = req.body;

  try {
    if (!fullName || !email || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: "Invalid email format" });
    }

    // Check if user already exists in MongoDB
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "Email already exists" });
    }

    // Create user in Supabase Auth if not already created by client
    try {
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        user_metadata: { full_name: fullName },
        email_confirm: true, // auto-confirm so users can login immediately
      });

      if (authError) {
        const isAlreadyRegistered =
          authError.message?.toLowerCase().includes("already") ||
          authError.code === "email_exists";
        if (!isAlreadyRegistered) {
          console.log("Supabase admin create note:", authError.message);
        }
      }
    } catch (adminErr) {
      console.log("Supabase admin createUser skipped:", adminErr.message);
    }

    // Create matching MongoDB profile
    const newUser = await User.create({
      email,
      fullName,
      password: "supabase-managed", // Auth is Supabase's responsibility
    });

    res.status(201).json({
      _id: newUser._id,
      fullName: newUser.fullName,
      email: newUser.email,
      profilePic: newUser.profilePic,
    });

    // Send welcome email (non-blocking)
    try {
      await sendWelcomeEmail(newUser.email, newUser.fullName, ENV.CLIENT_URL);
    } catch (error) {
      console.error("Failed to send welcome email:", error);
    }
  } catch (error) {
    console.log("Error in signup controller:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// ─── LOGIN ───────────────────────────────────────────────────────────────────
// Login is handled client-side via Supabase JS SDK.
// This endpoint is kept for completeness but the token is issued by Supabase directly.
export const login = async (req, res) => {
  return res.status(200).json({ message: "Use Supabase client-side login" });
};

// ─── LOGOUT ──────────────────────────────────────────────────────────────────
export const logout = async (req, res) => {
  try {
    // Optionally revoke the session server-side
    const token =
      req.headers["authorization"]?.split(" ")[1] ||
      req.cookies?.["sb-access-token"];

    if (token) {
      await supabaseAdmin.auth.admin.signOut(token);
    }

    res.status(200).json({ message: "Logged out successfully" });
  } catch (error) {
    console.log("Error in logout controller", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// ─── CHECK AUTH ───────────────────────────────────────────────────────────────
export const checkAuth = (req, res) => {
  try {
    // req.user is populated by protectRoute middleware
    res.status(200).json(req.user);
  } catch (error) {
    console.log("Error in checkAuth controller", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// ─── UPDATE PROFILE ───────────────────────────────────────────────────────────
export const updateProfile = async (req, res) => {
  try {
    const { profilePic } = req.body;
    if (!profilePic) return res.status(400).json({ message: "Profile pic is required" });

    const userId = req.user._id;

    let profileUrl = profilePic;
    if (ENV.CLOUDINARY_CLOUD_NAME && ENV.CLOUDINARY_API_KEY && ENV.CLOUDINARY_API_SECRET) {
      try {
        const uploadResponse = await cloudinary.uploader.upload(profilePic);
        profileUrl = uploadResponse.secure_url;
      } catch (cloudErr) {
        console.error("Cloudinary upload failed, using direct image:", cloudErr.message);
      }
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { profilePic: profileUrl },
      { new: true }
    );

    res.status(200).json(updatedUser);
  } catch (error) {
    console.log("Error in update profile:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};
