import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listOrdersTool from "./tools/list-orders";
import getOrderTool from "./tools/get-order";
import listLeadsTool from "./tools/list-leads";
import searchInventoryTool from "./tools/search-inventory";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "xboom-flow-mcp",
  title: "XBoom Flow",
  version: "0.1.0",
  instructions:
    "Tools for XBoom Flow ERP/CRM. Use these to read orders, leads, and inventory on behalf of the signed-in user. Mutations are not exposed yet.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listOrdersTool, getOrderTool, listLeadsTool, searchInventoryTool],
});
