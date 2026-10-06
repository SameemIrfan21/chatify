import axios from "axios";
import { supabase } from "./supabase";

const API_URL =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.MODE === "development" ? "http://localhost:5001/api" : "/api");

export const axiosInstance = axios.create({
  baseURL: API_URL,
  withCredentials: true,
});

// Attach the Supabase access token to every request automatically
axiosInstance.interceptors.request.use(async (config) => {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (token) {
    config.headers["Authorization"] = `Bearer ${token}`;
  }
  return config;
});