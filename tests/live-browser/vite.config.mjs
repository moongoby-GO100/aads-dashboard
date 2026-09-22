import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({
 resolve:{alias:{'@':fileURLToPath(new URL('../../src',import.meta.url))}},
 define:{'process.env.NEXT_PUBLIC_API_URL':JSON.stringify('http://127.0.0.1:3198/api/v1')},
 esbuild:{jsx:'automatic'},
 server:{fs:{allow:[fileURLToPath(new URL('../..',import.meta.url))]}}
});
