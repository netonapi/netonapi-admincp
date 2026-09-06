import { defineFrontModule } from "@neton/application-front-contract";

export default defineFrontModule({
  id: "gateway",
  contractVersion: "1.0.0",
  pages: [
    { key: "gateway/channel/index", path: "/gateway/channel", entry: "channel-list", rendering: "client" },
    { key: "gateway/token/index", path: "/gateway/token", entry: "token-list", rendering: "client" },
    { key: "gateway/price/index", path: "/gateway/price", entry: "price-list", rendering: "client" },
    { key: "gateway/log/index", path: "/gateway/log", entry: "log-list", rendering: "client" },
    { key: "gateway/settlement/index", path: "/gateway/settlement", entry: "settlement-list", rendering: "client" },
    { key: "gateway/group/index", path: "/gateway/group", entry: "group-list", rendering: "client" },
    { key: "gateway/redemption/index", path: "/gateway/redemption", entry: "redemption-list", rendering: "client" },
    { key: "gateway/group-override/index", path: "/gateway/group-override", entry: "group-override-list", rendering: "client" },
  ],
});
