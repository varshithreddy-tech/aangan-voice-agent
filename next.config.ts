import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // context/*.md and prompts/*.md are read at runtime by the judge.
  outputFileTracingIncludes: {
    "/api/qualify": ["./context/**/*", "./prompts/**/*", "./docs/rubric.md"],
  },
};

export default nextConfig;
