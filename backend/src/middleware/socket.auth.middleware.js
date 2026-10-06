import supabaseAdmin from "../lib/supabase.js";
import User from "../models/User.js";

export const socketAuthMiddleware = async (socket, next) => {
  try {
    // Extract Supabase access token from handshake auth or cookie header
    let token = socket.handshake.auth?.token;

    if (!token) {
      // Fallback: parse from cookie header
      const cookieHeader = socket.handshake.headers.cookie;
      token = cookieHeader
        ?.split(/;\s*/)
        .find((row) => row.startsWith("sb-access-token="))
        ?.split("=")[1];
    }

    if (!token) {
      console.log("Socket connection rejected: No Supabase token provided");
      return next(new Error("Unauthorized - No Token Provided"));
    }

    // Verify with Supabase
    const { data, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !data?.user) {
      console.log("Socket connection rejected: Invalid Supabase token");
      return next(new Error("Unauthorized - Invalid Token"));
    }

    const supabaseUser = data.user;

    // Find or create MongoDB user
    let user = await User.findOne({ email: supabaseUser.email }).select("-password");

    if (!user) {
      const fullName =
        supabaseUser.user_metadata?.full_name ||
        supabaseUser.user_metadata?.name ||
        supabaseUser.email.split("@")[0];

      user = await User.create({
        email: supabaseUser.email,
        fullName,
        password: "supabase-managed",
        profilePic: supabaseUser.user_metadata?.avatar_url || "",
      });
    }

    socket.user = user;
    socket.userId = user._id.toString();

    console.log(`Socket authenticated for user: ${user.fullName} (${user._id})`);
    next();
  } catch (error) {
    console.log("Error in socket authentication:", error.message);
    next(new Error("Unauthorized - Authentication failed"));
  }
};