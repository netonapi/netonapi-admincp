import type { NextConfig } from "next";
import frontModules from "./front.modules";

const config: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  transpilePackages: [
    "@neton/application-front-contract",
    "@neton/application-front-workspace",
    "@neton/application-front-runtime",
    "@neton/application-front-kit",
    "@neton/application-front-resource",
    ...frontModules,
  ],
};

export default config;
