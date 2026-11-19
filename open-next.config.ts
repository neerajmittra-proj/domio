import { defineCloudflareConfig } from '@opennextjs/cloudflare';

// Default OpenNext setup: no incremental cache binding (Domio renders
// dynamically per request), so nothing extra to provision in Cloudflare.
export default defineCloudflareConfig();
