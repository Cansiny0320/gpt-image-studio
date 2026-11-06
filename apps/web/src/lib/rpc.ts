import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import type { RouterClient } from '@orpc/server';
import type { AppRouter } from '../server/api';
export const client: RouterClient<AppRouter> = createORPCClient(
  new RPCLink({ url: () => `${window.location.origin}/api/rpc` }),
);
