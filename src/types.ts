import { z } from "zod";

// ── MCP Configuration ──

export const WeaverConfigSchema = z.object({
  /** OA 服务器地址，例如 http://192.168.1.100 */
  baseUrl: z.string().url().describe("OA 服务器地址 (protocol://host:port)"),

  /** 许可证号码，在 ECOLOGY 数据库中预先生成 */
  appId: z.string().min(1).describe("许可证号码 (APPID)"),

  /** RSA 密钥对，如果未提供则自动生成 */
  rsaPrivateKeyPem: z.string().optional().describe("RSA 私钥 (PEM 格式)，不提供则自动生成"),
  rsaPublicKeyPem: z.string().optional().describe("RSA 公钥 (PEM 格式)，不提供则自动生成"),
});

export type WeaverConfig = z.infer<typeof WeaverConfigSchema>;

// ── Token 相关 ──

export interface TokenInfo {
  token: string;
  secret: string;
  spk: string; // 系统公钥
  expiresAt: number; // 过期时间戳 (ms)
}

// ── API 响应 ──

export interface ApiResponse<T = unknown> {
  status: boolean;
  code: number;
  msg: string;
  msgShowType?: string;
  data?: T;
  errmsg?: string;
  errcode?: string;
}

export interface AuthRegistResponse {
  secrit: string; // 注意拼写：文档里就是 secrit
  spk: string; // 系统 RSA 公钥
  status: boolean;
  code: number;
  msg: string;
  errmsg?: string;
  errcode?: string;
}

export interface AuthApplyTokenResponse {
  token: string;
  status: boolean;
  code: number;
  msg: string;
  errmsg?: string;
  errcode?: string;
}

// ── 工作流 ──

export interface WorkflowRequest {
  workflowId: string;
  userId: number;
  detailFields?: Record<string, unknown>;
  detailTables?: DetailTable[];
}

export interface DetailTable {
  tableId: string;
  rows: Record<string, unknown>[];
}

export interface WorkflowApproveAction {
  requestId: string;
  userId: number;
  opinion: string;
  approve: boolean; // true=同意, false=驳回
  nextNodeId?: string;
}

// ── 组织架构 ──

export interface HrmUser {
  id: number;
  loginid: string;
  lastname: string;
  department: string;
  departmentid: number;
  email: string;
  mobile: string;
  status: number;
}
