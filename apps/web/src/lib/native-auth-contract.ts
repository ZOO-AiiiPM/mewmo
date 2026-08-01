import { z } from "zod";

export const nativePlatformSchema = z.enum(["macos", "ios", "ipados"]).optional();

export const nativeLoginBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(512),
  deviceId: z.string().min(1).max(128).optional(),
  deviceName: z.string().max(128).optional(),
  platform: nativePlatformSchema,
});

export type NativeLoginBody = z.infer<typeof nativeLoginBodySchema>;

export const nativeRefreshBodySchema = z.object({
  refreshToken: z.string().min(16).max(1000),
});

export type NativeRefreshBody = z.infer<typeof nativeRefreshBodySchema>;

export const nativeLogoutBodySchema = z.object({
  refreshToken: z.string().min(16).max(1000).optional(),
});

export type NativeLogoutBody = z.infer<typeof nativeLogoutBodySchema>;
