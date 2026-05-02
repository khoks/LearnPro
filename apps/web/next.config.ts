import type { NextConfig } from "next";

// Workspace packages whose source ships as TypeScript with NodeNext-style `.js` relative
// imports must be listed here so Next.js's webpack pass runs them through SWC. Add a package
// the moment apps/web imports from it.
//
// `transpilePackages` alone isn't sufficient when the source uses `.js` extensions on relative
// imports (NodeNext convention) — webpack's resolver still won't follow `.js` to a `.ts` file.
// `extensionAlias` tells webpack: when you see `import './foo.js'`, also try `./foo.ts` and
// `./foo.tsx`. Standard fix for NodeNext-style ESM under webpack.
const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@learnpro/shared", "@learnpro/sandbox", "@learnpro/db"],
  webpack: (config) => {
    config.resolve = config.resolve ?? {};
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },
};

export default nextConfig;
