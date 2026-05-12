import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@dnd-kit/core", "@dnd-kit/sortable", "@dnd-kit/utilities"],
};

export default nextConfig;
