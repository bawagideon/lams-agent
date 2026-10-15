import { createClient } from '@supabase/supabase-js';
import { config } from '../src/config/env.ts';

const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
  global: {
    fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(10000) })
  }
});

async function main() {
  try {
    const { data: p } = await supabase.from('projects').select('id, name, status').limit(5);
    console.log('PROJECTS:', JSON.stringify(p));

    const { data: e } = await supabase.from('episodes').select('id, episode_number, title, status').limit(5);
    console.log('EPISODES:', JSON.stringify(e));

    const { data: s } = await supabase.from('scenes').select('id, scene_number, status, narration_text').limit(3);
    console.log('SCENES:', JSON.stringify(s));
  } catch (err) {
    console.error('ERROR:', err);
  }
  process.exit(0);
}

main();
