import { prisma } from "@/lib/prisma";

export const LOGIN_SECURITY_CONFIG_ID = 1;

export type LoginSecurityConfigValue = {
  enforceSingleDevicePerAccount: boolean;
  enforceSingleAccountPerDeviceIp: boolean;
  blockMobilePhoneLogin: boolean;
};

const DEFAULT_CONFIG: LoginSecurityConfigValue = {
  enforceSingleDevicePerAccount: true,
  enforceSingleAccountPerDeviceIp: true,
  blockMobilePhoneLogin: true,
};

export async function getLoginSecurityConfig(): Promise<LoginSecurityConfigValue> {
  const config = await prisma.loginSecurityConfig.findUnique({
    where: { id: LOGIN_SECURITY_CONFIG_ID },
  });
  if (!config) return DEFAULT_CONFIG;
  return {
    enforceSingleDevicePerAccount: config.enforceSingleDevicePerAccount,
    enforceSingleAccountPerDeviceIp: config.enforceSingleAccountPerDeviceIp,
    blockMobilePhoneLogin: config.blockMobilePhoneLogin,
  };
}

export async function saveLoginSecurityConfig(data: LoginSecurityConfigValue): Promise<LoginSecurityConfigValue> {
  const saved = await prisma.loginSecurityConfig.upsert({
    where: { id: LOGIN_SECURITY_CONFIG_ID },
    create: { id: LOGIN_SECURITY_CONFIG_ID, ...data },
    update: data,
  });
  return {
    enforceSingleDevicePerAccount: saved.enforceSingleDevicePerAccount,
    enforceSingleAccountPerDeviceIp: saved.enforceSingleAccountPerDeviceIp,
    blockMobilePhoneLogin: saved.blockMobilePhoneLogin,
  };
}
