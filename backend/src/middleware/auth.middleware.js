import supabaseAdmin from "../lib/supabase.js";
import User from "../models/User.js";
import { sendWelcomeEmail } from "../emails/emailHandlers.js";
import { ENV } from "../lib/env.js";

export const protectRoute = async (req, res, next) => {
  try {
    // Accept token from Authorization header (Bearer <token>) or cookie
    const authHeader = req.headers["authorization"];
    const token =
      (authHeader && authHeader.startsWith("Bearer ")
        ? authHeader.split(" ")[1]
        : null) || req.cookies?.["sb-access-token"];

    if (!token) {
      console.log("[protectRoute] 401: No token provided in headers or cookies");
      return res.status(401).json({ message: "Unauthorized - No Token Provided" });
    }

    // Verify the token with Supabase
    const { data, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !data?.user) {
      console.log("[protectRoute] 401: Supabase getUser error:", error?.message);
      return res.status(401).json({ message: "Unauthorized - Invalid Token" });
    }

    const supabaseUser = data.user;
    console.log("[protectRoute] Valid token for:", supabaseUser.email);

    // Find or create corresponding MongoDB User document
    let user = await User.findOne({ email: supabaseUser.email }).select("-password");

    if (!user) {
      // First-time login: auto-create MongoDB profile from Supabase identity
      const fullName =
        supabaseUser.user_metadata?.full_name ||
        supabaseUser.user_metadata?.name ||
        supabaseUser.email.split("@")[0];

      user = await User.create({
        email: supabaseUser.email,
        fullName,
        password: "supabase-managed", // placeholder — auth handled by Supabase
        profilePic: supabaseUser.user_metadata?.avatar_url || "",
      });

      try {
        await sendWelcomeEmail(user.email, user.fullName, ENV.CLIENT_URL);
      } catch (emailErr) {
        console.error("Failed to send welcome email to new user:", emailErr);
      }
    }

    req.user = user;
    req.supabaseUser = supabaseUser;

    next();
  } catch (error) {
    console.log("Error in protectRoute middleware:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};
