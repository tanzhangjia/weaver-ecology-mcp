# 🦞 泛微OA Ecology E9 MCP Server

基于 [Model Context Protocol (MCP)](https://modelcontextprotocol.io) 的泛微OA接口集成服务。

通过 MCP 协议，让 AI 客户端（如 Claude Desktop、Cursor、VS Code 等）直接调用泛微 OA 的接口。

## 快速开始

### 1. 安装

```bash
# 下载项目
git clone https://github.com/tanzhangjia/weaver-ecology-mcp.git
cd weaver-ecology-mcp

# 安装依赖
npm install

# 构建
npm run build
```

### 2. OA 侧准备

在泛微 OA 系统中执行以下操作：

**a. 配置接口白名单**
编辑 `ecology/WEB-INF/prop/weaver_session_filter.properties`，在 `unchecksessionurl=` 后添加：
```
/api/ec/dev/auth/regist;/api/ec/dev/auth/applytoken;
```

**b. 插入许可证**
```sql
INSERT INTO ECOLOGY_BIZ_EC(ID, APPID, NAME)
VALUES('123456', '你的APPID', 'MCP服务');
```

### 3. MCP 客户端配置

#### Claude Desktop

编辑 `claude_desktop_config.json`：

```json
{
  "mcpServers": {
    "weaver-ecology": {
      "command": "node",
      "args": ["/path/to/weaver-ecology-mcp/dist/index.js"],
      "env": {
        "WEAVER_BASE_URL": "http://192.168.1.100",
        "WEAVER_APP_ID": "EEAA5436-7577-4BE0-8C6C-89E9D88805EA",
        "WEAVER_RSA_PRIVATE_KEY": "-----BEGIN RSA PRIVATE KEY-----...-----END RSA PRIVATE KEY-----",
        "WEAVER_RSA_PUBLIC_KEY": "-----BEGIN PUBLIC KEY-----...-----END PUBLIC KEY-----"
      }
    }
  }
}
```

#### Cursor

在 Cursor 的 MCP 配置中，Command 填写：
```
node /path/to/weaver-ecology-mcp/dist/index.js
```

## 认证流程

MCP 服务自动处理泛微 OA 的 Token 认证：

```
┌──────────┐    ┌──────────────┐    ┌──────────┐
│ 注册请求  │───▶│ POST /regist │───▶│ 返回     │
│ (APPID +  │    │              │    │ secrit   │
│  公钥)    │    │              │    │ + spk    │
└──────────┘    └──────────────┘    └──────────┘
                      │
┌──────────┐    ┌──────────────┐    ┌──────────┐
│ 获取Token│───▶│POST /apply-  │───▶│  返回    │
│ (spk加密 │    │    token     │    │  token   │
│  secrit) │    │              │    │          │
└──────────┘    └──────────────┘    └──────────┘
                      │
┌──────────┐    ┌──────────────┐    ┌──────────┐
│ 调用接口  │───▶│ 业务API      │───▶│  返回    │
│ (token +  │    │              │    │  数据    │
│  userid)  │    │              │    │          │
└──────────┘    └──────────────┘    └──────────┘
```

- Token 默认 30 分钟有效，系统在过期前 5 分钟自动刷新
- RSA 密钥对自动生成（也可手动指定）
- userid 使用系统公钥 RSA 加密传输

## 可用工具

### 认证管理

| 工具 | 说明 |
|------|------|
| `weaver_auth_register` | 向OA注册许可证（系统自动管理，通常无需手动调用） |
| `weaver_auth_get_token` | 获取/刷新访问Token（系统自动管理） |

### 工作流

| 工具 | 说明 |
|------|------|
| `weaver_workflow_list` | 查询流程模板列表 |
| `weaver_workflow_create` | 发起流程请求（创建审批单） |
| `weaver_workflow_query` | 查询流程状态与审批进度 |
| `weaver_workflow_approve` | 审批/驳回流程 |

### 组织架构

| 工具 | 说明 |
|------|------|
| `weaver_hrm_user_query` | 查询人员信息（ID/登录名/姓名） |
| `weaver_hrm_dept_query` | 查询部门信息 |

### 附件 & 通用

| 工具 | 说明 |
|------|------|
| `weaver_doc_upload` | 上传附件文件到OA |
| `weaver_api_request` | 🔧 通用接口调用（内置工具未覆盖时使用） |

## 环境变量

| 变量 | 必填 | 说明 |
|------|------|------|
| `WEAVER_BASE_URL` | 是 | OA 服务器地址，如 `http://192.168.1.100` |
| `WEAVER_APP_ID` | 是 | 许可证号码 |
| `WEAVER_RSA_PRIVATE_KEY` | 否 | RSA 私钥 PEM（不提供则自动生成） |
| `WEAVER_RSA_PUBLIC_KEY` | 否 | RSA 公钥 PEM（不提供则自动生成） |

## 常见问题

### 注册失败：「没有在找到正确的APPID」
→ 确认 `ECOLOGY_BIZ_EC` 表中已插入对应的 APPID

### Token 失效/超时
→ 系统会自动刷新，如持续失败请检查 OA 服务器时间是否同步

### 接口返回「认证信息错误」
→ 确认 RSA 公钥/私钥一致，检查 OA 服务器版本

## 许可证

Apache License 2.0

```
Copyright 2025 tanzhangjia

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```
