/* global process */

/** @type {import("next").NextConfig} */
const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  serverExternalPackages: ["pg", "@prisma/adapter-pg", "bcryptjs", "@prisma/client"],
};

export default nextConfig;
