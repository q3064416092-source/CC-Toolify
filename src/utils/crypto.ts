import crypto from "node:crypto";

const deriveKey = (secret: string): Buffer =>
  crypto.createHash("sha256").update(secret).digest();

export const encryptSecret = (value: string, secret: string): string => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", deriveKey(secret), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
};

export const decryptSecret = (payload: string, secret: string): string => {
  const raw = Buffer.from(payload, "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const encrypted = raw.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", deriveKey(secret), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
};

export const signValue = (value: string, secret: string): string =>
  crypto.createHmac("sha256", secret).update(value).digest("hex");

export const constantTimeEquals = (a: string, b: string): boolean => {
  const first = Buffer.from(a);
  const second = Buffer.from(b);
  if (first.length !== second.length) {
    return false;
  }
  return crypto.timingSafeEqual(first, second);
};
