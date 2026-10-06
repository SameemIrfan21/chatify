import { create } from "zustand";
import { axiosInstance } from "../lib/axios";
import { supabase } from "../lib/supabase";
import toast from "react-hot-toast";
import { io } from "socket.io-client";

const BASE_URL =
  import.meta.env.VITE_SOCKET_URL ||
  (import.meta.env.MODE === "development" ? "http://localhost:5001" : "/");

const getErrorMessage = (error, fallbackMessage) =>
  error?.response?.data?.message ||
  (error?.request ? "Cannot connect to the server. Make sure the backend is running." : error?.message) ||
  fallbackMessage;

export const useAuthStore = create((set, get) => ({
  authUser: null,
  isCheckingAuth: true,
  isSigningUp: false,
  isLoggingIn: false,
  socket: null,
  onlineUsers: [],

  // ─── CHECK AUTH ────────────────────────────────────────────────────────────
  checkAuth: async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      if (!token) {
        set({ authUser: null, isCheckingAuth: false });
        return;
      }

      // Fetch full MongoDB profile from backend
      const res = await axiosInstance.get("/auth/check", {
        headers: { Authorization: `Bearer ${token}` },
      });
      set({ authUser: res.data });
      get().connectSocket();
    } catch (error) {
      if (error?.response?.status !== 401) {
        console.log("Error in authCheck:", error);
      }
      set({ authUser: null });
    } finally {
      set({ isCheckingAuth: false });
    }
  },

  // ─── SIGNUP (Email + Password) ─────────────────────────────────────────────
  signup: async (data) => {
    set({ isSigningUp: true });
    try {
      // 1. Register in Supabase Auth
      const { data: authData, error: supabaseError } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          data: { full_name: data.fullName },
        },
      });

      if (supabaseError) throw supabaseError;

      let session = authData?.session;

      // If no session was established yet (e.g. Supabase email confirm is enabled)
      if (!session) {
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email: data.email,
          password: data.password,
        });

        if (signInError) {
          toast.success("Account created! If email confirmation is required, please check your inbox.");
          return;
        }
        session = signInData?.session;
      }

      const token = session?.access_token;

      // 2. Persist MongoDB profile via backend
      const res = await axiosInstance.post("/auth/signup", data, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      set({ authUser: res.data });
      toast.success("Account created successfully!");
      get().connectSocket();
    } catch (error) {
      console.error("Signup error:", error);
      toast.error(getErrorMessage(error, "Something went wrong"));
    } finally {
      set({ isSigningUp: false });
    }
  },

  // ─── LOGIN (Email + Password) ──────────────────────────────────────────────
  login: async (data) => {
    set({ isLoggingIn: true });
    try {
      const { data: authData, error: supabaseError } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      });

      if (supabaseError) throw supabaseError;

      const token = authData.session?.access_token;

      // Fetch MongoDB profile
      const res = await axiosInstance.get("/auth/check", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      set({ authUser: res.data });
      toast.success("Logged in successfully");
      get().connectSocket();
    } catch (error) {
      console.error("Login error:", error);
      if (error?.message?.toLowerCase().includes("email not confirmed")) {
        // Automatically request a new confirmation email to the user
        await supabase.auth.resend({ type: "signup", email: data.email }).catch(() => {});
        toast.error(
          "Email not confirmed! A verification link has been sent to your Gmail. Please click it or confirm in Supabase.",
          { duration: 7000 }
        );
      } else {
        toast.error(getErrorMessage(error, "Something went wrong"));
      }
    } finally {
      set({ isLoggingIn: false });
    }
  },

  // ─── RESEND CONFIRMATION EMAIL ─────────────────────────────────────────────
  resendConfirmationEmail: async (email) => {
    try {
      const { error } = await supabase.auth.resend({ type: "signup", email });
      if (error) throw error;
      toast.success("Verification email resent! Check your inbox.");
    } catch (err) {
      toast.error(err.message || "Failed to resend confirmation email");
    }
  },

  // ─── GOOGLE OAUTH ──────────────────────────────────────────────────────────
  loginWithGoogle: async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/`,
        },
      });
      if (error) throw error;
      // Supabase will redirect the browser — no further action needed here
    } catch (error) {
      toast.error(getErrorMessage(error, "Google login failed"));
    }
  },

  // ─── LOGOUT ────────────────────────────────────────────────────────────────
  logout: async () => {
    try {
      await supabase.auth.signOut();
      await axiosInstance.post("/auth/logout");
      set({ authUser: null });
      toast.success("Logged out successfully");
      get().disconnectSocket();
    } catch (error) {
      toast.error("Error logging out");
      console.log("Logout error:", error);
    }
  },

  // ─── UPDATE PROFILE ────────────────────────────────────────────────────────
  updateProfile: async (data) => {
    try {
      const res = await axiosInstance.put("/auth/update-profile", data);
      set({ authUser: res.data });
      toast.success("Profile updated successfully");
    } catch (error) {
      console.log("Error in update profile:", error);
      toast.error(getErrorMessage(error, "Something went wrong"));
    }
  },

  // ─── SOCKET ────────────────────────────────────────────────────────────────
  connectSocket: async () => {
    const { authUser } = get();
    if (!authUser || get().socket?.connected) return;

    // Get the current Supabase access token to authenticate the socket
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;

    const socket = io(BASE_URL, {
      withCredentials: true,
      auth: { token }, // sent to socketAuthMiddleware
    });

    socket.connect();
    set({ socket });

    socket.on("connect", () => console.log("Socket connected:", socket.id));
    socket.on("disconnect", (reason) => console.log("Socket disconnected:", reason));
    socket.on("connect_error", (error) => console.error("Socket error:", error.message));

    socket.on("getOnlineUsers", (userIds) => {
      set({ onlineUsers: userIds });
    });
  },

  disconnectSocket: () => {
    if (get().socket?.connected) get().socket.disconnect();
  },
}));

// ─── LISTEN FOR SUPABASE AUTH STATE CHANGES ────────────────────────────────
// Handles OAuth redirects and token refreshes automatically
supabase.auth.onAuthStateChange(async (event, session) => {
  const store = useAuthStore.getState();

  if (event === "SIGNED_IN" && session) {
    try {
      const res = await axiosInstance.get("/auth/check");
      useAuthStore.setState({ authUser: res.data, isCheckingAuth: false });
      store.connectSocket();
    } catch (e) {
      console.log("Auth state change error:", e.message);
      useAuthStore.setState({ isCheckingAuth: false });
    }
  }

  if (event === "SIGNED_OUT") {
    useAuthStore.setState({ authUser: null, isCheckingAuth: false });
    store.disconnectSocket();
  }
});