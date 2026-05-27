/**
 * 泛微 OA RSA 加密工具
 * 基于标准 RSA-OAEP 实现，兼容泛微 E9 的 RSA 认证流程
 *
 * 认证流程：
 * 1. 注册：发送 RSA 公钥 cpk → 获取系统公钥 spk + 密钥 secrit
 * 2. 获取 Token：用 spk 加密 secrit → 换取 token
 * 3. 调用接口：用 spk 加密 userid → 在请求头传递
 */

import forge from "node-forge";
import { Buffer } from "node:buffer";

/**
 * 生成 RSA 密钥对 (2048 位)
 */
export function generateKeyPair(): { publicKeyPem: string; privateKeyPem: string } {
  const keypair = forge.pki.rsa.generateKeyPair(2048);
  return {
    publicKeyPem: forge.pki.publicKeyToPem(keypair.publicKey),
    privateKeyPem: forge.pki.privateKeyToPem(keypair.privateKey),
  };
}

/**
 * 使用公钥加密 (RSA-OAEP / SHA-256)
 * 泛微 E9 的 rsa.encrypt 默认使用 RSA/ECB/OAEPWITHSHA-256ANDMGF1PADDING
 */
export function rsaEncrypt(plainText: string, publicKeyPem: string): string {
  const publicKey = forge.pki.publicKeyFromPem(publicKeyPem);
  const encrypted = publicKey.encrypt(plainText, "RSA-OAEP", {
    md: forge.md.sha256.create(),
    mgf: forge.mgf.mgf1.create(forge.md.sha256.create()),
  });
  return forge.util.encode64(encrypted);
}

/**
 * 使用私钥解密
 */
export function rsaDecrypt(encryptedBase64: string, privateKeyPem: string): string {
  const privateKey = forge.pki.privateKeyFromPem(privateKeyPem);
  const encrypted = forge.util.decode64(encryptedBase64);
  const decrypted = privateKey.decrypt(encrypted, "RSA-OAEP", {
    md: forge.md.sha256.create(),
    mgf: forge.mgf.mgf1.create(forge.md.sha256.create()),
  });
  return decrypted;
}

/**
 * DES 加密（用于早期版本密码加密，KB190601 及以上已废弃）
 * 注意：这里使用的是兼容泛微 Util_Security 的 DES/ECB/PKCS5Padding
 */
export function desEncrypt(plainText: string): string {
  // 泛微固定的密钥字符串
  const password =
    "9588028820109132570743325311898426347857298773549468758875018579537757772163" +
    "0844788736994473060344662006164119605741224340594691002358927027368608729012" +
    "47123456";

  const key = forge.util.createBuffer(password, "utf8");
  // DES 只使用前 8 字节
  const keyBuffer = key.getBytes(8);

  const cipher = forge.cipher.createCipher("DES-ECB", forge.util.createBuffer(keyBuffer));
  cipher.start();
  cipher.update(forge.util.createBuffer(plainText, "utf8"));
  if (!cipher.finish()) {
    throw new Error("DES encryption failed");
  }

  const encrypted = cipher.output.getBytes();
  return bytesToHex(encrypted);
}

function bytesToHex(bytes: string): string {
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    const h = bytes.charCodeAt(i).toString(16);
    hex += h.length === 1 ? "0" + h : h;
  }
  return hex.toUpperCase();
}

export function hexToBytes(hex: string): string {
  const normalized = hex.length % 2 === 1 ? "0" + hex : hex;
  let bytes = "";
  for (let i = 0; i < normalized.length; i += 2) {
    bytes += String.fromCharCode(parseInt(normalized.substring(i, i + 2), 16));
  }
  return bytes;
}
