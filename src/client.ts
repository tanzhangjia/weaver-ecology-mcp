/**
 * 泛微 OA HTTP 客户端
 * 封装 Token 管理、RSA 加密、请求签名
 */

import { WeaverConfig, TokenInfo, AuthRegistResponse, AuthApplyTokenResponse } from "./types.js";
import { generateKeyPair, rsaEncrypt } from "./crypto.js";

const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000; // token 过期前 5 分钟刷新

export class WeaverClient {
  private config: WeaverConfig;
  private tokenInfo: TokenInfo | null = null;
  private publicKeyPem: string;
  private privateKeyPem: string;

  constructor(config: WeaverConfig) {
    this.config = config;

    // RSA 密钥对：优先使用用户提供的，否则自动生成
    if (config.rsaPrivateKeyPem && config.rsaPublicKeyPem) {
      this.privateKeyPem = config.rsaPrivateKeyPem;
      this.publicKeyPem = config.rsaPublicKeyPem;
    } else {
      const keys = generateKeyPair();
      this.publicKeyPem = keys.publicKeyPem;
      this.privateKeyPem = keys.privateKeyPem;
    }
  }

  get baseUrl(): string {
    return this.config.baseUrl.replace(/\/+$/, "");
  }

  get appId(): string {
    return this.config.appId;
  }

  /**
   * 步骤 1：向 OA 注册许可证，获取秘钥和系统公钥
   * POST /api/ec/dev/auth/regist
   */
  async register(): Promise<{ secrit: string; spk: string }> {
    const url = `${this.baseUrl}/api/ec/dev/auth/regist`;

    const headers: Record<string, string> = {
      appid: this.appId,
      cpk: this.publicKeyPem,
    };

    const response = await this.rawRequest<AuthRegistResponse>(url, "POST", headers);
    if (!response.status) {
      throw new Error(`注册失败: ${response.errmsg || response.msg}`);
    }

    return {
      secrit: response.secrit,
      spk: response.spk,
    };
  }

  /**
   * 步骤 2：用系统公钥加密 secrit 获取 token
   * POST /api/ec/dev/auth/applytoken
   */
  async applyToken(secrit: string, spk: string): Promise<string> {
    const url = `${this.baseUrl}/api/ec/dev/auth/applytoken`;

    // 用系统公钥 spk 加密 secrit
    const secret = rsaEncrypt(secrit, spk);

    const headers: Record<string, string> = {
      appid: this.appId,
      secret: secret,
    };

    const response = await this.rawRequest<AuthApplyTokenResponse>(url, "POST", headers);
    if (!response.status) {
      throw new Error(`获取 Token 失败: ${response.errmsg || response.msg}`);
    }

    return response.token;
  }

  /**
   * 获取有效的 token（自动注册 + 刷新）
   */
  async getValidToken(): Promise<string> {
    // 如果已有 token 且未过期，直接返回
    if (this.tokenInfo && Date.now() < this.tokenInfo.expiresAt - TOKEN_REFRESH_MARGIN_MS) {
      return this.tokenInfo.token;
    }

    // 需要重新注册并获取 token
    const { secrit, spk } = await this.register();
    const token = await this.applyToken(secrit, spk);

    // 泛微 token 默认 30 分钟有效
    this.tokenInfo = {
      token,
      secret: secrit,
      spk,
      expiresAt: Date.now() + 30 * 60 * 1000,
    };

    return token;
  }

  /**
   * 使用 RSA 加密 userid
   */
  encryptUserId(userId: number | string): string {
    const spk = this.tokenInfo?.spk;
    if (!spk) {
      throw new Error("尚未获取系统公钥 (spk)，请先调用 getValidToken()");
    }
    return rsaEncrypt(String(userId), spk);
  }

  /**
   * 调用 OA 业务接口（带 token 认证）
   */
  async callApi<T>(
    path: string,
    method: "GET" | "POST" | "PUT" | "DELETE" = "POST",
    params?: Record<string, unknown>,
    userId?: number,
  ): Promise<T> {
    const token = await this.getValidToken();
    const url = `${this.baseUrl}${path.startsWith("/") ? path : "/" + path}`;

    const headers: Record<string, string> = {
      token: token,
      appid: this.appId,
    };

    // 普通接口需要 userid（白名单接口不需要）
    if (userId !== undefined) {
      headers.userid = this.encryptUserId(userId);
    }

    return this.rawRequest<T>(url, method, headers, params);
  }

  /**
   * 调用白名单接口（不带 userid）
   */
  async callWhitelistApi<T>(
    path: string,
    method: "GET" | "POST" | "PUT" | "DELETE" = "POST",
    params?: Record<string, unknown>,
  ): Promise<T> {
    const token = await this.getValidToken();
    const url = `${this.baseUrl}${path.startsWith("/") ? path : "/" + path}`;

    const headers: Record<string, string> = {
      token: token,
      appid: this.appId,
      skipsession: "1",
    };

    return this.rawRequest<T>(url, method, headers, params);
  }

  /**
   * 原生 HTTP 请求
   */
  private async rawRequest<T>(
    url: string,
    method: string,
    headers: Record<string, string>,
    body?: Record<string, unknown>,
  ): Promise<T> {
    const fetchOptions: RequestInit = {
      method,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        ...headers,
      },
    };

    if (body && method !== "GET") {
      // 泛微 API 通常使用 form-urlencoded
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(body)) {
        params.append(key, String(value));
      }
      fetchOptions.body = params.toString();
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch(url, { ...fetchOptions, signal: controller.signal });

      const contentType = response.headers.get("content-type") || "";

      if (contentType.includes("application/json")) {
        const data = await response.json();
        return data as T;
      } else {
        const text = await response.text();
        // 尝试解析 JSON
        try {
          return JSON.parse(text) as T;
        } catch {
          return { _raw: text } as unknown as T;
        }
      }
    } finally {
      clearTimeout(timeout);
    }
  }
}
