/**

 * Delete Gemini vision layout cache keys for an RTN (legacy + v2 prefix).

 * Usage: node scripts/redis-clear-vision-layout.mjs --rtn 062000080

 */

import 'dotenv/config';

import { clearVisionLayoutCacheForRtn } from '../src/services/visionLayoutCacheService.js';



const rtn = (process.argv.find((a, i) => process.argv[i - 1] === '--rtn') || '062000080').replace(

  /\D/g,

  ''

);



const result = await clearVisionLayoutCacheForRtn(rtn);

console.log(`Done. RTN=${result.rtn}, keys removed=${result.deleted}`);

if (result.keys?.length) result.keys.forEach((k) => console.log('DEL', k));


