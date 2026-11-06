import { PublicError } from './errors';

export type TransportEnvironment = {
  AI_GATEWAY_ACCOUNT_ID?: string;
  AI_GATEWAY_ID?: string;
  AI_GATEWAY_TOKEN?: string;
  IMAGE_RELAY_ORIGIN?: string;
  IMAGE_RELAY_TOKEN?: string;
};
export type ImageTransport = {
  name: 'relay' | 'ai_gateway';
  baseURL: string;
  headers: Record<string, string>;
};
export function imageTransport(env: TransportEnvironment): ImageTransport | undefined {
  const account = env.AI_GATEWAY_ACCOUNT_ID;
  const id = env.AI_GATEWAY_ID;
  if (env.IMAGE_RELAY_ORIGIN) {
    const url = URL.parse(env.IMAGE_RELAY_ORIGIN);
    if (
      !url ||
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash ||
      !env.IMAGE_RELAY_TOKEN ||
      account ||
      id
    ) {
      throw new PublicError('生图转发服务尚未正确配置，请联系站点维护者。', 503);
    }
    return {
      name: 'relay',
      baseURL: `${url.origin}/v1`,
      headers: { 'x-studio-relay-token': env.IMAGE_RELAY_TOKEN },
    };
  }
  if (!account && !id) return undefined;
  if (
    !account ||
    !/^[a-f0-9]{32}$/.test(account) ||
    !id ||
    !/^[a-z0-9_]+(?:-[a-z0-9_]+)*$/.test(id) ||
    !env.AI_GATEWAY_TOKEN
  ) {
    throw new PublicError('生图网关尚未正确配置，请联系站点维护者。', 503);
  }
  return {
    name: 'ai_gateway',
    baseURL: `https://gateway.ai.cloudflare.com/v1/${account}/${id}/openai`,
    headers: {
      'cf-aig-authorization': `Bearer ${env.AI_GATEWAY_TOKEN}`,
      'cf-aig-collect-log': 'false',
      'cf-aig-skip-cache': 'true',
      'cf-aig-no-wholesale': 'true',
      'cf-aig-max-attempts': '1',
      'cf-aig-request-timeout': '240000',
    },
  };
}
