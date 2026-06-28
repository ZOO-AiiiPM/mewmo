/** @type {import("next").NextConfig} */
const nextConfig = {
  serverExternalPackages: ["pg", "@prisma/adapter-pg", "bcryptjs", "@prisma/client"],
};

export default nextConfig;
