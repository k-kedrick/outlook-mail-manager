import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // imapflow / mailparser rely on Node built-ins (net, tls, streams) and must not
  // be bundled by Next's server compiler.
  serverExternalPackages: ["imapflow", "mailparser"],
};

export default nextConfig;
