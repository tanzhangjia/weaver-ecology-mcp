#!/usr/bin/env node

/**
 * MCP Server for 泛微OA Ecology E9
 *
 * 提供标准化的工具接口，用于与泛微 OA 系统交互。
 * 自动处理 Token 认证、RSA 加密、接口调用。
 *
 * 使用方式 (MCP 配置):
 * {
 *   "mcpServers": {
 *     "weaver-ecology": {
 *       "command": "node",
 *       "args": ["path/to/weaver-ecology/dist/index.js"],
 *       "env": {
 *         "WEAVER_BASE_URL": "http://your-oa-server:port",
 *         "WEAVER_APP_ID": "your-app-id",
 *         "WEAVER_RSA_PRIVATE_KEY": "optional-pem",
 *         "WEAVER_RSA_PUBLIC_KEY": "optional-pem"
 *       }
 *     }
 *   }
 * }
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { WeaverClient } from "./client.js";
import { WeaverConfigSchema, WeaverConfig } from "./types.js";

// ── MCP Tool Definitions ──

const AUTH_REGISTER_TOOL: Tool = {
  name: "weaver_auth_register",
  description: "向泛微OA注册许可证，返回系统公钥(spk)和密钥(secrit)。一般由系统自动管理，无需手动调用。",
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
  },
};

const AUTH_GET_TOKEN_TOOL: Tool = {
  name: "weaver_auth_get_token",
  description: "获取或刷新访问Token。系统自动管理过期，通常无需手动调用。",
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
  },
};

const WORKFLOW_LIST_TOOL: Tool = {
  name: "weaver_workflow_list",
  description: "查询泛微OA流程模板列表。获取可用的流程定义信息。",
  inputSchema: {
    type: "object",
    properties: {
      userId: {
        type: "number",
        description: "OA用户ID，用于鉴权",
      },
    },
    required: ["userId"],
  },
};

const WORKFLOW_CREATE_TOOL: Tool = {
  name: "weaver_workflow_create",
  description: "发起流程请求（流程申请）。创建一条新的工作流实例。",
  inputSchema: {
    type: "object",
    properties: {
      userId: {
        type: "number",
        description: "发起人OA用户ID",
      },
      workflowId: {
        type: "string",
        description: "流程模板ID（通过 weaver_workflow_list 获取）",
      },
      requestName: {
        type: "string",
        description: "流程标题",
      },
      detailFields: {
        type: "object",
        description: "表单主表字段，key=字段名, value=字段值",
        additionalProperties: true,
      },
      detailTables: {
        type: "array",
        description: "表单明细表数据（如有）",
        items: {
          type: "object",
          properties: {
            tableId: { type: "string", description: "明细表ID" },
            rows: {
              type: "array",
              items: {
                type: "object",
                description: "明细表行数据",
                additionalProperties: true,
              },
            },
          },
        },
      },
    },
    required: ["userId", "workflowId", "requestName"],
  },
};

const WORKFLOW_QUERY_TOOL: Tool = {
  name: "weaver_workflow_query",
  description: "查询流程请求的状态和审批进度。",
  inputSchema: {
    type: "object",
    properties: {
      userId: {
        type: "number",
        description: "OA用户ID，用于鉴权",
      },
      requestId: {
        type: "string",
        description: "流程请求ID",
      },
    },
    required: ["userId", "requestId"],
  },
};

const WORKFLOW_APPROVE_TOOL: Tool = {
  name: "weaver_workflow_approve",
  description: "审批或驳回流程请求。",
  inputSchema: {
    type: "object",
    properties: {
      userId: {
        type: "number",
        description: "审批人OA用户ID",
      },
      requestId: {
        type: "string",
        description: "流程请求ID",
      },
      approve: {
        type: "boolean",
        description: "true=同意, false=驳回",
      },
      opinion: {
        type: "string",
        description: "审批意见",
      },
      nextNodeId: {
        type: "string",
        description: "指定下一步节点ID（可选）",
      },
    },
    required: ["userId", "requestId", "approve", "opinion"],
  },
};

const HRM_USER_QUERY_TOOL: Tool = {
  name: "weaver_hrm_user_query",
  description: "查询人员信息（支持按ID、登录名、姓名搜索）。",
  inputSchema: {
    type: "object",
    properties: {
      userId: {
        type: "number",
        description: "OA用户ID，用于鉴权",
      },
      searchType: {
        type: "string",
        enum: ["id", "loginid", "lastname"],
        description: "搜索类型",
      },
      searchValue: {
        type: "string",
        description: "搜索值",
      },
    },
    required: ["userId", "searchType", "searchValue"],
  },
};

const HRM_DEPT_QUERY_TOOL: Tool = {
  name: "weaver_hrm_dept_query",
  description: "查询部门信息。",
  inputSchema: {
    type: "object",
    properties: {
      userId: {
        type: "number",
        description: "OA用户ID，用于鉴权",
      },
      deptId: {
        type: "string",
        description: "部门ID（可选，不传则查询所有部门）",
      },
    },
    required: ["userId"],
  },
};

const DOC_UPLOAD_TOOL: Tool = {
  name: "weaver_doc_upload",
  description: "上传附件文件到OA系统。支持文件URL方式上传。",
  inputSchema: {
    type: "object",
    properties: {
      userId: {
        type: "number",
        description: "OA用户ID，用于鉴权",
      },
      fileUrl: {
        type: "string",
        description: "文件的HTTP可访问URL",
      },
      fileName: {
        type: "string",
        description: "文件名（带扩展名）",
      },
    },
    required: ["userId", "fileUrl", "fileName"],
  },
};

const API_REQUEST_TOOL: Tool = {
  name: "weaver_api_request",
  description: "通用接口调用。当内置工具无法覆盖时，直接调用任意OA接口路径。",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "API路径，例如 /api/hrm/employee/search",
      },
      method: {
        type: "string",
        enum: ["GET", "POST", "PUT", "DELETE"],
        description: "HTTP 方法",
      },
      userId: {
        type: "number",
        description: "OA用户ID（白名单接口可不传）",
      },
      params: {
        type: "object",
        description: "请求参数键值对",
        additionalProperties: true,
      },
      isWhitelist: {
        type: "boolean",
        description: "是否为白名单接口（无需userid），默认为false",
      },
    },
    required: ["path"],
  },
};

// ── MCP Server ──

async function main() {
  // 从环境变量读取配置
  const envConfig: Partial<WeaverConfig> = {
    baseUrl: process.env.WEAVER_BASE_URL,
    appId: process.env.WEAVER_APP_ID,
    rsaPrivateKeyPem: process.env.WEAVER_RSA_PRIVATE_KEY,
    rsaPublicKeyPem: process.env.WEAVER_RSA_PUBLIC_KEY,
  };

  // 验证配置
  const result = WeaverConfigSchema.safeParse(envConfig);
  if (!result.success) {
    console.error(
      "❌ 配置错误：请设置环境变量 WEAVER_BASE_URL 和 WEAVER_APP_ID\n" +
      "示例:\n" +
      '  export WEAVER_BASE_URL="http://192.168.1.100"\n' +
      '  export WEAVER_APP_ID="EEAA5436-7577-4BE0-8C6C-89E9D88805EA"\n' +
      "错误详情: " + result.error.message
    );
    process.exit(1);
  }

  const client = new WeaverClient(result.data);
  const server = new Server(
    {
      name: "weaver-ecology-mcp",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  // ── 工具列表 ──

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      AUTH_REGISTER_TOOL,
      AUTH_GET_TOKEN_TOOL,
      WORKFLOW_LIST_TOOL,
      WORKFLOW_CREATE_TOOL,
      WORKFLOW_QUERY_TOOL,
      WORKFLOW_APPROVE_TOOL,
      HRM_USER_QUERY_TOOL,
      HRM_DEPT_QUERY_TOOL,
      DOC_UPLOAD_TOOL,
      API_REQUEST_TOOL,
    ],
  }));

  // ── 工具调用 ──

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case "weaver_auth_register": {
          const result = await client.register();
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        case "weaver_auth_get_token": {
          const token = await client.getValidToken();
          return {
            content: [{ type: "text", text: `Token: ${token}\n有效期: 30 分钟（自动刷新）` }],
          };
        }

        case "weaver_workflow_list": {
          const { userId } = args as { userId: number };
          const data = await client.callApi("/api/workflow/list", "GET", undefined, userId);
          return {
            content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
          };
        }

        case "weaver_workflow_create": {
          const a = args as {
            userId: number;
            workflowId: string;
            requestName: string;
            detailFields?: Record<string, unknown>;
            detailTables?: { tableId: string; rows: Record<string, unknown>[] }[];
          };
          const params: Record<string, unknown> = {
            workflowId: a.workflowId,
            requestName: a.requestName,
          };
          if (a.detailFields) {
            params.detailFields = JSON.stringify(a.detailFields);
          }
          if (a.detailTables) {
            params.detailTables = JSON.stringify(a.detailTables);
          }
          const data = await client.callApi("/api/workflow/request/create", "POST", params, a.userId);
          return {
            content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
          };
        }

        case "weaver_workflow_query": {
          const { userId, requestId } = args as { userId: number; requestId: string };
          const data = await client.callApi(
            `/api/workflow/request/status`,
            "POST",
            { requestId },
            userId,
          );
          return {
            content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
          };
        }

        case "weaver_workflow_approve": {
          const a = args as {
            userId: number;
            requestId: string;
            approve: boolean;
            opinion: string;
            nextNodeId?: string;
          };
          const params: Record<string, unknown> = {
            requestId: a.requestId,
            approve: a.approve ? "1" : "0",
            opinion: a.opinion,
          };
          if (a.nextNodeId) {
            params.nextNodeId = a.nextNodeId;
          }
          const data = await client.callApi("/api/workflow/request/approve", "POST", params, a.userId);
          return {
            content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
          };
        }

        case "weaver_hrm_user_query": {
          const { userId, searchType, searchValue } = args as {
            userId: number;
            searchType: string;
            searchValue: string;
          };
          const data = await client.callApi(
            `/api/hrm/employee/${searchType}/${encodeURIComponent(searchValue)}`,
            "GET",
            undefined,
            userId,
          );
          return {
            content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
          };
        }

        case "weaver_hrm_dept_query": {
          const { userId, deptId } = args as { userId: number; deptId?: string };
          const path = deptId
            ? `/api/hrm/department/get/${deptId}`
            : "/api/hrm/department/list";
          const data = await client.callApi(path, "GET", undefined, userId);
          return {
            content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
          };
        }

        case "weaver_doc_upload": {
          const { userId, fileUrl, fileName } = args as {
            userId: number;
            fileUrl: string;
            fileName: string;
          };
          const data = await client.callApi(
            "/api/file/upload",
            "POST",
            { fileUrl, fileName },
            userId,
          );
          return {
            content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
          };
        }

        case "weaver_api_request": {
          const a = args as {
            path: string;
            method?: "GET" | "POST" | "PUT" | "DELETE";
            userId?: number;
            params?: Record<string, unknown>;
            isWhitelist?: boolean;
          };
          const method = a.method || "POST";

          let data: unknown;
          if (a.isWhitelist) {
            data = await client.callWhitelistApi(a.path, method, a.params);
          } else if (a.userId) {
            data = await client.callApi(a.path, method, a.params, a.userId);
          } else {
            return {
              isError: true,
              content: [{
                type: "text",
                text: "非白名单接口需要提供 userId 参数",
              }],
            };
          }

          return {
            content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
          };
        }

        default:
          return {
            isError: true,
            content: [{ type: "text", text: `未知工具: ${name}` }],
          };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        isError: true,
        content: [{ type: "text", text: `调用失败: ${message}` }],
      };
    }
  });

  // ── 启动 ──

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("🦞 泛微OA Ecology MCP Server 已启动 (通过 stdio)");
  console.error(`📡 服务器: ${envConfig.baseUrl}`);
  console.error(`🔑 AppID: ${envConfig.appId}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
